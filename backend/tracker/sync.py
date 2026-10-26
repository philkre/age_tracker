"""One sync pass: import matches -> group sessions -> parse replays."""

import logging
import threading
from datetime import timedelta

import httpx
from sqlalchemy.orm import sessionmaker

from tracker import companion, replays
from tracker.config import Settings
from tracker.challenge import complete_if_done
from tracker.grouping import group_sessions
from tracker.importer import sync_from_api

log = logging.getLogger(__name__)
_lock = threading.Lock()


def run_sync(
    Session: sessionmaker,
    settings: Settings,
    companion_client: httpx.Client | None = None,
    replay_client: httpx.Client | None = None,
) -> dict:
    """Run one full sync. Skips (returns {"skipped": True}) if one is already running."""
    if not _lock.acquire(blocking=False):
        return {"skipped": True}
    try:
        companion_client = companion_client or companion.make_client()
        replay_client = replay_client or replays.make_client()
        with Session() as db:
            new = sync_from_api(db, companion_client, max_pages=settings.max_pages)
            group_sessions(db, gap=timedelta(hours=settings.session_gap_hours))
            complete_if_done(db)
            parsed = replays.process_pending(db, replay_client, settings.replay_dir)
        log.info("sync: %d new games, %d replays parsed", len(new), len(parsed))
        return {"new_games": new, "replays_parsed": parsed}
    finally:
        _lock.release()
