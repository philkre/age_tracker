from datetime import datetime, timedelta

from tracker.grouping import group_sessions
from tracker.models import Game, TrainingSession

T0 = datetime(2026, 10, 1, 19, 0)


def add_game(db, match_id, start_min, length_min=30):
    start = T0 + timedelta(minutes=start_min)
    g = Game(
        match_id=match_id,
        started_at=start,
        finished_at=start + timedelta(minutes=length_min),
        leaderboard="rm_team",
        map_slug="arabia",
        map_name="Arabia",
        our_team=1,
        raw={},
    )
    db.add(g)
    db.commit()
    return g


def sessions(db):
    return [
        [g.match_id for g in s.games]
        for s in db.query(TrainingSession).order_by(TrainingSession.started_at)
    ]


def test_one_night_is_one_session(db):
    for i, start in enumerate([0, 35, 70, 110]):
        add_game(db, i + 1, start)
    group_sessions(db, gap=timedelta(hours=3))
    assert sessions(db) == [[1, 2, 3, 4]]
    s = db.query(TrainingSession).one()
    assert s.started_at == T0
    assert s.ended_at == T0 + timedelta(minutes=140)


def test_weekly_nights_are_separate_sessions(db):
    add_game(db, 1, 0)
    add_game(db, 2, 40)
    add_game(db, 3, 7 * 24 * 60)
    add_game(db, 4, 7 * 24 * 60 + 40)
    group_sessions(db, gap=timedelta(hours=3))
    assert sessions(db) == [[1, 2], [3, 4]]


def test_gap_measured_from_previous_finish(db):
    add_game(db, 1, 0, length_min=60)
    add_game(db, 2, 60 + 179)  # 2h59 after game 1 ended
    add_game(db, 3, 60 + 179 + 30 + 181)  # 3h01 after game 2 ended
    group_sessions(db, gap=timedelta(hours=3))
    assert sessions(db) == [[1, 2], [3]]


def test_regrouping_keeps_session_ids(db):
    add_game(db, 1, 0)
    add_game(db, 2, 40)
    group_sessions(db, gap=timedelta(hours=3))
    sid = db.query(TrainingSession).one().id

    add_game(db, 3, 80)
    group_sessions(db, gap=timedelta(hours=3))
    s = db.query(TrainingSession).one()
    assert s.id == sid
    assert [g.match_id for g in s.games] == [1, 2, 3]


def test_bridging_game_merges_sessions(db):
    add_game(db, 1, 0)
    add_game(db, 3, 400)
    group_sessions(db, gap=timedelta(hours=3))
    first_id = db.query(TrainingSession).order_by(TrainingSession.started_at).first().id
    assert len(sessions(db)) == 2

    add_game(db, 2, 200)  # late-imported game closes the gap
    group_sessions(db, gap=timedelta(hours=3))
    assert sessions(db) == [[1, 2, 3]]
    assert db.query(TrainingSession).one().id == first_id


def test_fixture_matches(db, companion_matches):
    from tracker.importer import import_matches

    import_matches(db, companion_matches)
    group_sessions(db, gap=timedelta(hours=3))
    groups = sessions(db)
    assert sum(len(g) for g in groups) == 30
    # training-camp weekend: several sessions, each in time order
    assert len(groups) > 1
    for s in db.query(TrainingSession):
        assert s.games[0].started_at == s.started_at
