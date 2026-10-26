"""Re-extract stats from downloaded replays after extractor changes: `uv run python -m tracker.reparse`."""

import logging

from tracker.config import settings
from tracker.db import init_db, make_engine, make_sessionmaker
from tracker.replays import reparse

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    engine = make_engine(settings.db_url)
    init_db(engine)
    with make_sessionmaker(engine)() as db:
        print(f"reparsed {len(reparse(db))} games")
