import copy
from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from tracker.challenge import active_challenge, board, complete_if_done, start_challenge
from tracker.civs import ranked_civs
from tracker.config import Settings
from tracker.db import init_db, make_engine, make_sessionmaker
from tracker.grouping import group_sessions
from tracker.importer import import_matches
from tracker.main import create_app
from tracker.models import Challenge

# Fixture games run 2026-10-24 09:07 .. 2026-10-26 08:25 (30 games, all four of us).
FIRST = datetime(2026, 10, 24, 9, 0)


def test_ranked_civs():
    civs = ranked_civs()
    assert len(civs) == 56
    assert civs["mayans"] == "Maya" and civs["georgians"] == "Georgians"
    assert "spartans" not in civs  # Chronicles civs aren't in the ranked pool


def test_board_counts_first_use_per_civ(db, companion_matches):
    import_matches(db, companion_matches)
    ch = start_challenge(db, "Test", started_at=FIRST)
    b = board(db, ch)
    assert b["total"] == 56
    used = [c for c in b["civs"] if c["used"]]
    assert b["used"] == len(used) > 0
    # first use is the earliest game with that civ
    persians = next(c for c in b["civs"] if c["civ"] == "persians")
    assert persians["used"] and persians["plays"] > 1
    assert persians["match_id"] == 515914693  # first game of the fixture, Sundown on Persians
    assert persians["player"] == "Sundown"
    # each member's tally adds up to the used civs
    assert sum(m["civs_used"] for m in b["members"]) == b["used"]
    assert b["games"] == 30 and b["wins"] + b["losses"] == 30


def test_board_respects_start_and_end(db, companion_matches):
    import_matches(db, companion_matches)
    ch = start_challenge(db, "Late", started_at=datetime(2026, 10, 26, 8, 0))
    assert board(db, ch)["games"] == 1  # only the 08:07 game
    ch.ended_at = datetime(2026, 10, 26, 8, 1)
    db.commit()
    assert board(db, ch)["games"] == 0


def test_in_progress_game_marks_civ(db, companion_matches):
    live = copy.deepcopy(companion_matches[0])
    live["matchId"] = 999
    live["started"] = "2026-10-27T19:00:00.000Z"
    live["finished"] = None
    for t in live["teams"]:
        for p in t["players"]:
            p["won"] = None
            if p["profileId"] == 252396:
                p["civ"], p["civName"] = "spanish", "Spanish"
    import_matches(db, [live])
    ch = start_challenge(db, "Live", started_at=datetime(2026, 10, 27, 18, 0))
    spanish = next(c for c in board(db, ch)["civs"] if c["civ"] == "spanish")
    assert spanish["used"] and spanish["in_progress"] and spanish["won"] is None


def test_only_one_active_and_autocomplete(db, companion_matches, monkeypatch):
    import_matches(db, companion_matches)
    ch = start_challenge(db, "A", started_at=FIRST)
    with pytest.raises(ValueError):
        start_challenge(db, "B")
    assert active_challenge(db).id == ch.id

    assert complete_if_done(db) is False  # not all civs played yet
    monkeypatch.setattr("tracker.challenge.ranked_civs", lambda: {"persians": "Persians", "teutons": "Teutons"})
    assert complete_if_done(db) is True
    assert db.get(Challenge, ch.id).completed_at is not None
    assert active_challenge(db) is None


@pytest.fixture
def client(tmp_path, companion_matches):
    engine = make_engine(f"sqlite:///{tmp_path / 't.db'}")
    init_db(engine)
    Session = make_sessionmaker(engine)
    with Session() as db:
        import_matches(db, companion_matches)
        group_sessions(db, gap=timedelta(hours=3))
    settings = Settings(data_dir=tmp_path, sync_enabled=False, admin_token="pw")
    return TestClient(create_app(settings, Session))


def test_challenge_api(client):
    assert client.get("/api/challenge").json() is None
    auth = {}  # starting/ending is open to everyone, no passphrase

    r = client.post("/api/challenge", json={"name": "Thursday", "started_at": "2026-10-24T09:00:00Z"}, headers=auth)
    assert r.status_code == 201
    b = client.get("/api/challenge").json()
    assert b["active"] and b["name"] == "Thursday" and b["used"] > 0
    assert b["started_at"].endswith("Z")
    assert client.post("/api/challenge", json={"name": "Y"}, headers=auth).status_code == 409

    assert client.post("/api/challenge/end", headers=auth).status_code == 200
    b = client.get("/api/challenge").json()
    assert not b["active"] and b["ended_at"]  # latest challenge still shown
    assert client.post("/api/challenge/end", headers=auth).status_code == 404


def test_default_start_is_now(db):
    before = datetime.now() - timedelta(minutes=5)
    ch = start_challenge(db, "Now")
    assert ch.started_at > before - timedelta(hours=24)  # naive UTC, close to now


def test_sessions_carry_challenge_badge(db, companion_matches):
    from datetime import timedelta as td

    from tracker.challenge import session_challenges
    from tracker.grouping import group_sessions
    from tracker.models import TrainingSession

    import_matches(db, companion_matches)
    group_sessions(db, gap=td(hours=3))
    ch = start_challenge(db, "Weekend", started_at=FIRST)
    sessions = db.query(TrainingSession).order_by(TrainingSession.started_at).all()
    info = session_challenges(db, sessions)

    assert set(info) == {s.id for s in sessions}  # every fixture session is inside the window
    assert all(i["id"] == ch.id and i["name"] == "Weekend" for i in info.values())
    new = [c["civ"] for s in sessions for c in info[s.id]["new_civs"]]
    assert len(new) == len(set(new)) == board(db, ch)["used"]  # each civ is new in exactly one session
    first = info[sessions[0].id]["new_civs"]
    assert "persians" in {c["civ"] for c in first} and first[0]["player"]


def test_sessions_outside_window_have_no_badge(db, companion_matches):
    from datetime import timedelta as td

    from tracker.challenge import session_challenges
    from tracker.grouping import group_sessions
    from tracker.models import TrainingSession

    import_matches(db, companion_matches)
    group_sessions(db, gap=td(hours=3))
    start_challenge(db, "Future", started_at=datetime(2026, 11, 1))
    assert session_challenges(db, db.query(TrainingSession).all()) == {}


def test_challenge_history_api(client):
    auth = {"Authorization": "Bearer pw"}
    client.post("/api/challenge", json={"name": "Old", "started_at": "2026-10-24T09:00:00Z"}, headers=auth)
    client.post("/api/challenge/end", headers=auth)
    client.post("/api/challenge", json={"name": "New"}, headers=auth)

    hist = client.get("/api/challenges").json()
    assert [c["name"] for c in hist] == ["New", "Old"]
    assert hist[0]["active"] and not hist[1]["active"]
    assert "civs" not in hist[0] and hist[1]["used"] > 0

    old = client.get(f"/api/challenges/{hist[1]['id']}").json()
    assert old["name"] == "Old" and len(old["civs"]) == 56
    assert client.get("/api/challenges/999").status_code == 404

    s = client.get("/api/sessions?limit=100").json()["items"]
    assert any(x["challenge"] and x["challenge"]["name"] == "Old" for x in s)
    with_new = next(x for x in s if x["challenge"] and x["challenge"]["new_civs"])
    detail = client.get(f"/api/sessions/{with_new['id']}").json()
    assert detail["challenge"] == with_new["challenge"]


def test_start_without_passphrase_uses_default_name(client):
    r = client.post("/api/challenge", json={})
    assert r.status_code == 201
    assert r.json()["name"] == "Gotta play em all!"
    assert client.post("/api/challenge/end").status_code == 200


def test_discard_only_without_games(client):
    # Fresh challenge, no games yet -> discard deletes it entirely.
    assert client.post("/api/challenge", json={"started_at": "2027-01-01T00:00:00Z"}).status_code == 201
    assert client.post("/api/challenge/discard").status_code == 204
    assert client.get("/api/challenge").json() is None
    assert client.get("/api/challenges").json() == []
    assert client.post("/api/challenge/discard").status_code == 404

    # Games already played -> refuse, keep it.
    client.post("/api/challenge", json={"started_at": "2026-10-24T09:00:00Z"})
    r = client.post("/api/challenge/discard")
    assert r.status_code == 409 and "end the challenge" in r.json()["detail"]
    assert client.get("/api/challenge").json()["active"]


def test_delete_past_challenge(client):
    client.post("/api/challenge", json={"name": "Old", "started_at": "2026-10-24T09:00:00Z"})
    old_id = client.get("/api/challenge").json()["id"]
    assert client.delete(f"/api/challenges/{old_id}").status_code == 409  # still running
    client.post("/api/challenge/end")

    sessions_before = client.get("/api/sessions?limit=100").json()["total"]
    assert client.delete(f"/api/challenges/{old_id}").status_code == 204
    assert client.get("/api/challenges").json() == []
    assert client.get(f"/api/challenges/{old_id}").status_code == 404
    assert client.delete(f"/api/challenges/{old_id}").status_code == 404
    # games and sessions are untouched, badges disappear
    s = client.get("/api/sessions?limit=100").json()
    assert s["total"] == sessions_before and all(x["challenge"] is None for x in s["items"])

