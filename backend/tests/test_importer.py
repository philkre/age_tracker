import copy
from datetime import datetime

import httpx

from tracker import companion
from tracker.config import MEMBER_IDS
from tracker.importer import import_matches, sync_from_api
from tracker.models import Game, GamePlayer, ReplayStatus


def test_imports_all_training_games(db, companion_matches):
    new = import_matches(db, companion_matches)
    assert len(new) == 30
    assert db.query(Game).count() == 30
    assert db.query(GamePlayer).count() == 240


def test_game_fields(db, companion_matches):
    import_matches(db, companion_matches)
    g = db.get(Game, 516462729)
    assert g.started_at == datetime(2026, 10, 26, 8, 7, 53)
    assert g.finished_at == datetime(2026, 10, 26, 8, 25, 56)
    assert g.map_name == "Pilgrims"
    assert g.leaderboard == "rm_team"
    assert g.won is True
    assert g.our_team == 2
    assert g.replay_status == ReplayStatus.PENDING
    members = [p for p in g.players if p.is_member]
    assert {p.profile_id for p in members} == MEMBER_IDS
    crib = next(p for p in members if p.profile_id == 252396)
    assert (crib.civ, crib.rating, crib.rating_diff, crib.won) == ("georgians", 1082, 13, True)
    assert crib.rating_after == 1095


def test_reimport_is_idempotent_and_updates(db, companion_matches):
    unfinished = copy.deepcopy(companion_matches[0])
    unfinished["finished"] = None
    for t in unfinished["teams"]:
        for p in t["players"]:
            p["won"] = None
    assert import_matches(db, [unfinished]) == [516462729]
    assert db.get(Game, 516462729).won is None

    assert import_matches(db, companion_matches) == [m["matchId"] for m in companion_matches[1:]]
    g = db.get(Game, 516462729)
    assert g.won is True
    assert g.finished_at is not None
    assert len(g.players) == 8


def test_skips_non_training_games(db, companion_matches):
    m = companion_matches[0]
    one_v_one = {**copy.deepcopy(m), "matchId": 1, "leaderboard": "rm_1v1"}
    solo = copy.deepcopy(m)
    solo["matchId"] = 2
    for t in solo["teams"]:
        for p in t["players"]:
            if p["profileId"] in MEMBER_IDS and p["profileId"] != 252396:
                p["profileId"] += 1_000_000_000  # strangers
    assert import_matches(db, [one_v_one, solo]) == []


def test_two_members_on_same_team_count(db, companion_matches):
    m = copy.deepcopy(companion_matches[0])
    for t in m["teams"]:
        for p in t["players"]:
            if p["profileId"] in (2645968, 249543):
                p["profileId"] += 1_000_000_000
    assert import_matches(db, [m]) == [m["matchId"]]


def test_sync_from_api_pages_and_dedupes(db, companion_matches):
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(dict(request.url.params))
        return httpx.Response(200, json={"matches": companion_matches})

    client = httpx.Client(transport=httpx.MockTransport(handler), base_url=companion.BASE_URL)
    new = sync_from_api(db, client, max_pages=1)
    assert len(new) == 30
    # one request per member, all four see the same games
    assert len(calls) == 4
    assert {c["profile_ids"] for c in calls} == {str(i) for i in MEMBER_IDS}
