"""Civ challenge: play every ranked civ once as a team. Progress is derived from stored games."""

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from tracker.civs import ranked_civs
from tracker.config import MEMBERS
from tracker.models import Challenge, Game

DEFAULT_NAME = "Gotta play em all!"


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def active_challenge(db: Session) -> Challenge | None:
    return (
        db.query(Challenge)
        .filter(Challenge.ended_at.is_(None), Challenge.completed_at.is_(None))
        .order_by(Challenge.started_at.desc())
        .first()
    )


def latest_challenge(db: Session) -> Challenge | None:
    return active_challenge(db) or db.query(Challenge).order_by(Challenge.started_at.desc()).first()


def start_challenge(db: Session, name: str, started_at: datetime | None = None) -> Challenge:
    if active_challenge(db):
        raise ValueError("a challenge is already active")
    ch = Challenge(name=name, started_at=started_at or _now())
    db.add(ch)
    db.commit()
    return ch


def end_challenge(db: Session) -> Challenge | None:
    ch = active_challenge(db)
    if ch:
        ch.ended_at = _now()
        db.commit()
    return ch


def _games(db: Session, ch: Challenge) -> list[Game]:
    q = db.query(Game).filter(Game.started_at >= ch.started_at)
    end = ch.ended_at or ch.completed_at
    if end:
        q = q.filter(Game.started_at <= end)
    return q.order_by(Game.started_at).all()


def _first_uses(games: list[Game]) -> tuple[dict[str, dict], dict[str, int]]:
    """civ slug -> first time one of us played it (in game order), and play counts per civ."""
    names = {m.profile_id: m.name for m in MEMBERS}
    first: dict[str, dict] = {}
    plays: dict[str, int] = {}
    for g in games:
        for p in g.players:
            if not p.is_member:
                continue
            plays[p.civ] = plays.get(p.civ, 0) + 1
            first.setdefault(
                p.civ,
                {
                    "profile_id": p.profile_id,
                    "player": names.get(p.profile_id, p.name),
                    "match_id": g.match_id,
                    "session_id": g.session_id,
                    "started_at": g.started_at.replace(tzinfo=timezone.utc),
                    "won": p.won,
                    "in_progress": g.finished_at is None,
                },
            )
    return first, plays


def board(db: Session, ch: Challenge) -> dict:
    civs = ranked_civs()
    games = _games(db, ch)
    first, plays = _first_uses(games)

    rows = []
    for slug, name in civs.items():
        use = first.get(slug)
        rows.append({"civ": slug, "name": name, "used": use is not None, "plays": plays.get(slug, 0), **(use or {})})

    members = []
    for m in MEMBERS:
        mine = [u for u in first.values() if u["profile_id"] == m.profile_id]
        members.append({
            "profile_id": m.profile_id,
            "name": m.name,
            "civs_used": len(mine),
            "wins": sum(1 for u in mine if u["won"]),
        })

    finished = [g for g in games if g.won is not None]
    utc = lambda d: d.replace(tzinfo=timezone.utc) if d else None  # noqa: E731
    return {
        "id": ch.id,
        "name": ch.name,
        "started_at": utc(ch.started_at),
        "ended_at": utc(ch.ended_at),
        "completed_at": utc(ch.completed_at),
        "active": ch.ended_at is None and ch.completed_at is None,
        "total": len(civs),
        "used": sum(1 for r in rows if r["used"]),
        "repeats": sum(max(0, n - 1) for s, n in plays.items() if s in civs),
        "games": len(games),
        "wins": sum(1 for g in finished if g.won),
        "losses": sum(1 for g in finished if not g.won),
        "civs": rows,
        "members": members,
    }


def complete_if_done(db: Session) -> bool:
    """Mark the active challenge complete once every ranked civ has been played."""
    ch = active_challenge(db)
    if ch is None:
        return False
    civs = set(ranked_civs())
    games = _games(db, ch)
    seen: set[str] = set()
    for g in games:
        seen.update(p.civ for p in g.players if p.is_member)
        if civs <= seen:
            ch.completed_at = g.started_at
            db.commit()
            return True
    return False


SUMMARY_KEYS = ("civs", "members")


def summary(db: Session, ch: Challenge) -> dict:
    """Board without the per-civ / per-member detail (for history lists)."""
    return {k: v for k, v in board(db, ch).items() if k not in SUMMARY_KEYS}


def all_challenges(db: Session) -> list[Challenge]:
    return db.query(Challenge).order_by(Challenge.started_at.desc()).all()


def session_challenges(db: Session, sessions: list) -> dict[int, dict]:
    """session id -> {id, name, new_civs} for sessions with games inside a challenge window.
    new_civs are the civs whose first challenge use happened in that session."""
    challenges = all_challenges(db)
    if not challenges or not sessions:
        return {}
    civ_names = ranked_civs()
    out: dict[int, dict] = {}
    for ch in challenges:
        games = _games(db, ch)
        in_window = {g.match_id for g in games}
        first, _ = _first_uses(games)
        for s in sessions:
            if s.id in out or not any(g.match_id in in_window for g in s.games):
                continue
            new = [
                {"civ": civ, "name": civ_names.get(civ, civ), "profile_id": u["profile_id"], "player": u["player"]}
                for civ, u in first.items()
                if u["session_id"] == s.id and civ in civ_names
            ]
            out[s.id] = {"id": ch.id, "name": ch.name, "new_civs": new}
    return out

