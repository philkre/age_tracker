import asyncio
import base64
import binascii
import hmac
import logging
import time
from contextlib import asynccontextmanager
from datetime import timezone
from pathlib import Path

from fastapi import BackgroundTasks, FastAPI, Header, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse
from sqlalchemy.orm import sessionmaker

from tracker.config import MEMBERS, Settings, settings as default_settings
from tracker.db import init_db, make_engine, make_sessionmaker
from tracker import challenge, schemas
from tracker.models import Challenge, Game, GameMap, TrainingSession
from tracker.stats import game_row, session_summary
from tracker.sync import run_sync

log = logging.getLogger(__name__)
SYNC_TICK_S = 15  # how often the loop checks whether a sync is due


def _sync_interval_s(Session: sessionmaker, settings: Settings) -> float:
    """Poll fast while a civ challenge runs (live board), slow otherwise."""
    with Session() as db:
        if challenge.active_challenge(db):
            return settings.challenge_sync_seconds
    return settings.sync_interval_minutes * 60


async def _sync_loop(Session: sessionmaker, settings: Settings) -> None:
    last = float("-inf")
    while True:
        try:
            interval = await asyncio.to_thread(_sync_interval_s, Session, settings)
            if time.monotonic() - last >= interval:
                last = time.monotonic()
                await asyncio.to_thread(run_sync, Session, settings)
        except Exception:
            log.exception("sync failed")
        await asyncio.sleep(SYNC_TICK_S)


OPEN_PATHS = frozenset({"/api/health"})  # Fly health checks


def _add_site_password(app: FastAPI, settings: Settings) -> None:
    """Whole site behind one shared password (browser basic-auth prompt, any username).
    A valid admin bearer token also passes, so scripted POST /api/sync keeps working."""
    password = settings.site_password.encode()

    def allowed(header: str) -> bool:
        scheme, _, value = header.partition(" ")
        if scheme.lower() == "basic":
            try:
                _, _, given = base64.b64decode(value).partition(b":")
            except (binascii.Error, ValueError):
                return False
            return hmac.compare_digest(given, password)
        if scheme.lower() == "bearer" and settings.admin_token:
            return hmac.compare_digest(value.encode(), settings.admin_token.encode())
        return False

    @app.middleware("http")
    async def site_password(request: Request, call_next):
        if request.url.path in OPEN_PATHS or allowed(request.headers.get("authorization", "")):
            return await call_next(request)
        return Response(
            "Password required",
            status_code=401,
            headers={"WWW-Authenticate": 'Basic realm="TopGun Training", charset="UTF-8"'},
        )


def create_app(settings: Settings = default_settings, Session: sessionmaker | None = None) -> FastAPI:
    if Session is None:
        settings.data_dir.mkdir(parents=True, exist_ok=True)
        engine = make_engine(settings.db_url)
        init_db(engine)
        Session = make_sessionmaker(engine)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
        task = asyncio.create_task(_sync_loop(Session, settings)) if settings.sync_enabled else None
        yield
        if task:
            task.cancel()

    app = FastAPI(title="AoE2 Training Tracker", lifespan=lifespan)
    if settings.site_password:
        _add_site_password(app, settings)
    app.add_middleware(GZipMiddleware, minimum_size=1024)  # map payloads are ~140 KB of JSON
    if settings.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=list(settings.cors_origins),
            allow_methods=["GET", "POST"],
            allow_headers=["Authorization"],
        )

    def require_admin(authorization: str | None) -> None:
        if not settings.admin_token:
            raise HTTPException(403, "admin endpoints disabled (TRACKER_ADMIN_TOKEN unset)")
        expected = f"Bearer {settings.admin_token}"
        if not authorization or not hmac.compare_digest(authorization, expected):
            raise HTTPException(401, "invalid admin token")

    @app.get("/api/health", response_model=schemas.Health)
    def health():
        return {"ok": True}

    @app.get("/api/players", response_model=list[schemas.Member])
    def players():
        return [{"name": m.name, "profile_id": m.profile_id} for m in MEMBERS]

    @app.get("/api/sessions", response_model=schemas.SessionPage)
    def list_sessions(limit: int = Query(20, ge=1, le=100), offset: int = Query(0, ge=0)):
        with Session() as db:
            rows = (
                db.query(TrainingSession)
                .order_by(TrainingSession.started_at.desc())
                .offset(offset)
                .limit(limit)
                .all()
            )
            badges = challenge.session_challenges(db, rows)
            return {
                "items": [session_summary(s, badges.get(s.id)) for s in rows],
                "total": db.query(TrainingSession).count(),
                "offset": offset,
                "limit": limit,
            }

    @app.get("/api/sessions/{session_id}", response_model=schemas.SessionDetail)
    def get_session(session_id: int):
        with Session() as db:
            s = db.get(TrainingSession, session_id)
            if s is None:
                raise HTTPException(404, "session not found")
            badge = challenge.session_challenges(db, [s]).get(s.id)
            return {**session_summary(s, badge), "game_list": [game_row(g) for g in s.games]}

    @app.get("/api/games/{match_id}", response_model=schemas.GameOut)
    def get_game(match_id: int):
        with Session() as db:
            g = db.get(Game, match_id)
            if g is None:
                raise HTTPException(404, "game not found")
            return game_row(g, full=True)

    @app.get("/api/games/{match_id}/map", response_model=schemas.GameMapOut)
    def get_game_map(match_id: int):
        with Session() as db:
            gm = db.get(GameMap, match_id)
            if gm is None:
                raise HTTPException(404, "no map data (replay not parsed)")
            return gm.data

    @app.get("/api/challenge", response_model=schemas.ChallengeOut | None)
    def get_challenge():
        """The active civ challenge, else the most recent one, else null."""
        with Session() as db:
            ch = challenge.latest_challenge(db)
            return challenge.board(db, ch) if ch else None

    @app.get("/api/challenges", response_model=list[schemas.ChallengeSummary])
    def list_challenges():
        with Session() as db:
            return [challenge.summary(db, ch) for ch in challenge.all_challenges(db)]

    @app.get("/api/challenges/{challenge_id}", response_model=schemas.ChallengeOut)
    def get_challenge_by_id(challenge_id: int):
        with Session() as db:
            ch = db.get(Challenge, challenge_id)
            if ch is None:
                raise HTTPException(404, "challenge not found")
            return challenge.board(db, ch)

    @app.delete("/api/challenges/{challenge_id}", status_code=204)
    def delete_challenge(challenge_id: int):
        """Remove a past challenge from the history. Its games stay; only the challenge window is dropped."""
        with Session() as db:
            try:
                found = challenge.delete_challenge(db, challenge_id)
            except ValueError as e:
                raise HTTPException(409, str(e))
            if not found:
                raise HTTPException(404, "challenge not found")

    @app.post("/api/challenge", status_code=201, response_model=schemas.ChallengeOut)
    def start_challenge(body: schemas.ChallengeStart):
        # Open on purpose: any of us can start/end a challenge from the site, no passphrase.
        started = body.started_at
        if started is not None and started.tzinfo is not None:
            started = started.astimezone(timezone.utc).replace(tzinfo=None)
        with Session() as db:
            try:
                ch = challenge.start_challenge(db, body.name.strip() or challenge.DEFAULT_NAME, started)
            except ValueError as e:
                raise HTTPException(409, str(e))
            return challenge.board(db, ch)

    @app.post("/api/challenge/end", response_model=schemas.ChallengeOut)
    def end_challenge():
        with Session() as db:
            ch = challenge.end_challenge(db)
            if ch is None:
                raise HTTPException(404, "no active challenge")
            return challenge.board(db, ch)

    @app.post("/api/challenge/discard", status_code=204)
    def discard_challenge():
        """Throw away an active challenge that has no games yet (started by mistake)."""
        with Session() as db:
            try:
                ch = challenge.discard_challenge(db)
            except ValueError as e:
                raise HTTPException(409, str(e))
            if ch is None:
                raise HTTPException(404, "no active challenge")

    @app.post("/api/sync", status_code=202, response_model=schemas.Queued)
    def trigger_sync(background: BackgroundTasks, authorization: str | None = Header(default=None)):
        require_admin(authorization)
        background.add_task(run_sync, Session, settings)
        return {"queued": True}

    @app.get("/api/{path:path}", include_in_schema=False)
    def api_not_found(path: str):
        raise HTTPException(404, "not found")

    if settings.static_dir:
        static = Path(settings.static_dir).resolve()

        @app.get("/{path:path}", include_in_schema=False)
        def spa(path: str):
            # Real files (assets) as-is, everything else -> index.html (client-side routing).
            file = (static / path).resolve()
            if path and file.is_file() and file.is_relative_to(static):
                return FileResponse(file)
            return FileResponse(static / "index.html")

    return app
