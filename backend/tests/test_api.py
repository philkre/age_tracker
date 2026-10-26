from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from tracker import companion
from tracker.config import Settings
from tracker.db import init_db, make_engine, make_sessionmaker
from tracker.main import create_app
from tracker.sync import run_sync


@pytest.fixture
def env(tmp_path, companion_matches, replay_zip):
    settings = Settings(data_dir=tmp_path, sync_enabled=False, session_gap_hours=3)
    engine = make_engine(f"sqlite:///{tmp_path / 'test.db'}")
    init_db(engine)
    Session = make_sessionmaker(engine)

    api = httpx.Client(
        transport=httpx.MockTransport(lambda r: httpx.Response(200, json={"matches": companion_matches})),
        base_url=companion.BASE_URL,
    )

    def replay_handler(req):
        # only the fixture replay exists; everything else expired
        if req.url.params["gameId"] == "516462729":
            return httpx.Response(200, content=Path(replay_zip).read_bytes())
        return httpx.Response(404)

    result = run_sync(Session, settings, api, httpx.Client(transport=httpx.MockTransport(replay_handler)))
    return TestClient(create_app(settings, Session)), result


def test_sync_result(env):
    _, result = env
    assert len(result["new_games"]) == 30
    assert result["replays_parsed"] == [516462729]


def test_sessions_feed(env):
    client, _ = env
    page = client.get("/api/sessions?limit=100").json()
    assert page["total"] == len(page["items"])
    sessions = page["items"]
    assert sum(s["games"] for s in sessions) == 30
    assert sessions[0]["started_at"] > sessions[-1]["started_at"]  # newest first
    latest = sessions[0]
    assert latest["wins"] + latest["losses"] == latest["games"]
    assert latest["results"].count(True) == latest["wins"]
    assert len(latest["game_ids"]) == len(latest["game_maps"]) == len(latest["game_parsed"]) == latest["games"]
    assert latest["game_ids"][-1] == 516462729 and latest["game_parsed"][-1] is True
    assert {m["name"] for m in latest["members"]} == {"Cribbeltz", "Maverick", "Sundown", "johannesnagel"}
    assert len(latest["durations_s"]) == latest["games"]
    assert len(latest["team_rating_path"]) == latest["games"] + 1
    assert len(latest["opp_ratings"]) == latest["games"]
    path = latest["team_rating_path"]
    deltas = [m["rating_delta"] for m in latest["members"]]
    if None not in path and None not in deltas:
        assert path[-1] - path[0] == pytest.approx(sum(deltas) / len(deltas), abs=0.1)


def test_session_detail_and_game(env):
    client, _ = env
    sid = client.get("/api/sessions").json()["items"][0]["id"]
    detail = client.get(f"/api/sessions/{sid}").json()
    assert detail["game_list"][-1]["match_id"] == 516462729
    assert detail["replays_parsed"] == 1
    crib = next(m for m in detail["members"] if m["name"] == "Cribbeltz")
    assert crib["avg_eapm"] == 32
    assert crib["best_feudal_s"] is not None

    game = client.get("/api/games/516462729").json()
    assert game["replay_status"] == "parsed"
    assert game["players"][0]["is_member"]  # our team first
    assert "units" in game["players"][0]["replay_stats"]


def test_404s(env):
    client, _ = env
    assert client.get("/api/sessions/9999").status_code == 404
    assert client.get("/api/games/1").status_code == 404


def test_game_map(env):
    client, _ = env
    m = client.get("/api/games/516462729/map").json()
    assert m["dimension"] == 220
    assert set(m["commands"]) >= {"252396", "1308804"}
    assert client.get("/api/games/516459710/map").status_code == 404  # replay not parsed

