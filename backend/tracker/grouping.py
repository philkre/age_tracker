"""Cluster games into training sessions by time gap."""

from collections import Counter
from datetime import timedelta

from sqlalchemy.orm import Session

from tracker.models import Game, TrainingSession


def group_sessions(db: Session, gap: timedelta) -> None:
    """Regroup all games. A new session starts when a game begins more than
    `gap` after the previous game ended. Existing session rows are reused so
    ids stay stable when games are added (incl. late/backfilled ones)."""
    games = db.query(Game).order_by(Game.started_at).all()

    clusters: list[list[Game]] = []
    last_end = None
    for g in games:
        if last_end is None or g.started_at - last_end > gap:
            clusters.append([])
        clusters[-1].append(g)
        end = g.finished_at or g.started_at
        last_end = end if last_end is None else max(last_end, end)

    existing = {s.id: s for s in db.query(TrainingSession)}
    claimed: set[int] = set()
    for cluster in clusters:
        votes = Counter(g.session_id for g in cluster if g.session_id in existing)
        candidates = sorted(
            (sid for sid in votes if sid not in claimed), key=lambda sid: (-votes[sid], sid)
        )
        if candidates:
            session = existing[candidates[0]]
            claimed.add(session.id)
        else:
            session = TrainingSession()
            db.add(session)
        session.started_at = cluster[0].started_at
        session.ended_at = max(g.finished_at or g.started_at for g in cluster)
        for g in cluster:
            g.session = session

    for sid, s in existing.items():
        if sid not in claimed:
            db.delete(s)
    db.commit()
