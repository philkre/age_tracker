import copy
import json
from pathlib import Path

import pytest

from tracker.db import init_db, make_engine, make_sessionmaker

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture
def db():
    engine = make_engine("sqlite://")
    init_db(engine)
    with make_sessionmaker(engine)() as s:
        yield s


@pytest.fixture
def companion_matches():
    """30 real team RM matches (all four of us), newest first."""
    data = json.loads((FIXTURES / "companion_matches_252396.json").read_text())
    return copy.deepcopy(data["matches"])


@pytest.fixture
def replay_zip() -> Path:
    return FIXTURES / "replay_516462729.zip"
