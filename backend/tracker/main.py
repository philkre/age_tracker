import asyncio
import hmac
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import BackgroundTasks, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from sqlalchemy.orm import sessionmaker

from tracker.config import MEMBERS, Settings, settings as default_settings
from tracker.db import init_db, make_engine, make_sessionmaker
from tracker.models import Game, TrainingSession
from tracker.stats import game_row, session_summary
from tracker.sync import run_sync

log = logging.getLogger(__name__)


async def _sync_loop(Session: sessionmaker, settings: Settings) -> None:
    while True:
        try:
            await asyncio.to_thread(run_sync, Session, settings)
        except Exception:
            log.exception("sync failed")
        await asyncio.sleep(settings.sync_interval_minutes * 60)


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

    @app.get("/api/health")
    def health():
        return {"ok": True}

    @app.get("/api/players")
    def players():
        return [{"name": m.name, "profile_id": m.profile_id} for m in MEMBERS]

    @app.get("/api/sessions")
    def list_sessions(limit: int = 20, offset: int = 0):
        with Session() as db:
            rows = (
                db.query(TrainingSession)
                .order_by(TrainingSession.started_at.desc())
                .offset(offset)
                .limit(limit)
                .all()
            )
            return [session_summary(s) for s in rows]

    @app.get("/api/sessions/{session_id}")
    def get_session(session_id: int):
        with Session() as db:
            s = db.get(TrainingSession, session_id)
            if s is None:
                raise HTTPException(404, "session not found")
            return {**session_summary(s), "game_list": [game_row(g) for g in s.games]}

    @app.get("/api/games/{match_id}")
    def get_game(match_id: int):
        with Session() as db:
            g = db.get(Game, match_id)
            if g is None:
                raise HTTPException(404, "game not found")
            return game_row(g, full=True)

    @app.post("/api/sync", status_code=202)
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
