import copy
import io
import zipfile

import httpx
import pytest

from tracker.importer import import_matches
from tracker.models import Game, ReplayStatus
from tracker.replays import extract_stats, process_pending

MATCH = 516462729


@pytest.fixture(scope="module")
def stats(request):
    from pathlib import Path

    return extract_stats(Path(__file__).parent / "fixtures" / "replay_516462729.zip")


def test_extract_match_level(stats):
    assert 1765 < stats["duration_game_s"] < 1775  # 29:29 game time
    assert len(stats["players"]) == 8


def test_extract_player_stats(stats):
    crib = stats["players"][252396]
    assert crib["eapm"] == 32
    assert 999 < crib["feudal_s"] < 1000  # 16:39
    assert 1705 < crib["castle_s"] < 1706  # 28:25
    assert crib["imperial_s"] is None
    assert crib["villagers_queued"] == 32
    assert crib["town_centers_built"] == 2
    assert crib["resign_s"] is None
    assert crib["first_military_s"] is not None
    assert crib["replay_stats"]["units"]["Fishing Ship"] == 48
    techs = [t["name"] for t in crib["replay_stats"]["techs"]]
    assert "Fletching" in techs and "Feudal Age" not in techs
    assert len(techs) == len(set(techs))
    assert len(crib["replay_stats"]["timeseries"]) > 100

    loser = stats["players"][20382218]  # President of USA resigned first
    assert 1723 < loser["resign_s"] < 1725


def _client(handler):
    return httpx.Client(transport=httpx.MockTransport(handler))


def _zip_bytes(zip_path):
    return zip_path.read_bytes()


def test_process_pending_downloads_and_parses(db, companion_matches, replay_zip, tmp_path):
    import_matches(db, [companion_matches[0]])
    tried = []

    def handler(req):
        tried.append(int(req.url.params["profileId"]))
        if len(tried) == 1:
            return httpx.Response(404, text="Match not found.")
        return httpx.Response(200, content=_zip_bytes(replay_zip), headers={"content-type": "application/zip"})

    done = process_pending(db, _client(handler), tmp_path)
    assert done == [MATCH]
    g = db.get(Game, MATCH)
    assert g.replay_status == ReplayStatus.PARSED
    assert g.duration_game_s > 1700
    assert (tmp_path / f"{MATCH}.zip").exists()
    crib = next(p for p in g.players if p.profile_id == 252396)
    assert crib.eapm == 32 and crib.castle_s > 1700
    assert len(tried) == 2

    # nothing left to do
    assert process_pending(db, _client(handler), tmp_path) == []


def test_unavailable_when_all_404(db, companion_matches, tmp_path):
    import_matches(db, [companion_matches[0]])
    process_pending(db, _client(lambda r: httpx.Response(404)), tmp_path)
    g = db.get(Game, MATCH)
    assert g.replay_status == ReplayStatus.UNAVAILABLE


def test_failed_when_parse_breaks(db, companion_matches, tmp_path):
    import_matches(db, [companion_matches[0]])
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr(f"AgeIIDE_Replay_{MATCH}.aoe2record", b"garbage")
    process_pending(db, _client(lambda r: httpx.Response(200, content=buf.getvalue())), tmp_path)
    g = db.get(Game, MATCH)
    assert g.replay_status == ReplayStatus.FAILED
    assert g.replay_error


def test_transient_error_stays_pending(db, companion_matches, tmp_path):
    import_matches(db, [companion_matches[0]])
    process_pending(db, _client(lambda r: httpx.Response(503)), tmp_path)
    g = db.get(Game, MATCH)
    assert g.replay_status == ReplayStatus.PENDING
    assert g.replay_attempts == 1


def test_skips_unfinished_games(db, companion_matches, tmp_path):
    m = copy.deepcopy(companion_matches[0])
    m["finished"] = None
    import_matches(db, [m])
    called = []
    process_pending(db, _client(lambda r: called.append(1) or httpx.Response(404)), tmp_path)
    assert called == []


def test_parses_older_save_version():
    """Save 67.2 (game patch 1792, a 3v3) has the same header changes as 68.9."""
    from pathlib import Path

    s = extract_stats(Path(__file__).parent / "fixtures" / "replay_477543020_save67.2.zip")
    assert len(s["players"]) == 6
    assert all(p["eapm"] for p in s["players"].values())
    assert 252396 in s["players"]


def test_extract_map(stats):
    m = stats["map"]
    assert m["dimension"] == 220
    side = -(-220 // m["scale"])
    assert len(m["terrain"]) == side * side
    assert all(c in m["alphabet"][: len(m["palette"])] for c in set(m["terrain"]))
    sx, sy = m["starts"][252396]
    assert 190 < sx < 210 and 115 < sy < 135  # Cribbeltz' starting villagers
    cmds = m["commands"][252396]
    assert len(cmds) > 100
    t, x, y, kind = cmds[0]
    assert 0 <= x <= 220 and 0 <= y <= 220 and kind in (0, 1)
    assert [c[0] for c in cmds] == sorted(c[0] for c in cmds)


def test_process_pending_stores_map(db, companion_matches, replay_zip, tmp_path):
    from tracker.models import GameMap

    import_matches(db, [companion_matches[0]])
    process_pending(db, _client(lambda r: httpx.Response(200, content=_zip_bytes(replay_zip))), tmp_path)
    gm = db.get(GameMap, MATCH)
    assert gm is not None and gm.data["dimension"] == 220
    assert "252396" in gm.data["commands"] or 252396 in gm.data["commands"]


def test_reparse_refreshes_parsed_games(db, companion_matches, replay_zip, tmp_path):
    from tracker.models import GameMap
    from tracker.replays import reparse

    import_matches(db, [companion_matches[0]])
    process_pending(db, _client(lambda r: httpx.Response(200, content=_zip_bytes(replay_zip))), tmp_path)
    db.get(GameMap, MATCH).data = {"stale": True}
    db.commit()
    assert reparse(db) == [MATCH]
    assert db.get(GameMap, MATCH).data["dimension"] == 220
