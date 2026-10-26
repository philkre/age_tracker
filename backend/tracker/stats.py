"""Read-side aggregation for sessions (small data -> computed on the fly)."""

from datetime import datetime, timezone
from statistics import mean

from tracker.config import MEMBERS
from tracker.models import Game, GamePlayer, TrainingSession


def _utc(dt: datetime | None) -> datetime | None:
    """DB stores naive UTC; make it explicit so clients convert to local time."""
    return dt.replace(tzinfo=timezone.utc) if dt else None


def _avg(values):
    values = [v for v in values if v is not None]
    return round(mean(values), 1) if values else None


def _min(values):
    values = [v for v in values if v is not None]
    return min(values) if values else None


def _rating_path(games: list[Game], profile_id: int) -> list[int | None]:
    """Rating before the first game, then after each game (None where the member sat out)."""
    path: list[int | None] = []
    for g in games:
        p = next((p for p in g.players if p.profile_id == profile_id), None)
        if not path:
            path.append(p.rating if p else None)
        path.append(p.rating_after if p else None)
    return path


def member_summary(games: list[Game]) -> list[dict]:
    out = []
    for m in MEMBERS:
        rows: list[GamePlayer] = [p for g in games for p in g.players if p.profile_id == m.profile_id]
        if not rows:
            continue
        rated = [r for r in rows if r.rating is not None]
        start = rated[0].rating if rated else None
        end = rated[-1].rating_after if rated else None
        out.append({
            "name": m.name,
            "profile_id": m.profile_id,
            "games": len(rows),
            "wins": sum(1 for r in rows if r.won),
            "rating_start": start,
            "rating_end": end,
            "rating_delta": end - start if start is not None and end is not None else None,
            "civs": [r.civ_name for r in rows],
            "avg_eapm": _avg(r.eapm for r in rows),
            "avg_feudal_s": _avg(r.feudal_s for r in rows),
            "best_feudal_s": _min(r.feudal_s for r in rows),
            "avg_castle_s": _avg(r.castle_s for r in rows),
            "best_castle_s": _min(r.castle_s for r in rows),
            "villagers_queued": sum(r.villagers_queued or 0 for r in rows),
            "military_queued": sum(r.military_queued or 0 for r in rows),
            "rating_path": _rating_path(games, m.profile_id),
        })
    return out


def session_summary(s: TrainingSession) -> dict:
    games = s.games
    finished = [g for g in games if g.won is not None]
    return {
        "id": s.id,
        "started_at": _utc(s.started_at),
        "ended_at": _utc(s.ended_at),
        "games": len(games),
        "wins": sum(1 for g in finished if g.won),
        "losses": sum(1 for g in finished if not g.won),
        "results": [g.won for g in games],
        "play_time_s": sum(g.duration_real_s or 0 for g in games),
        "durations_s": [g.duration_real_s or 0 for g in games],
        "maps": sorted({g.map_name for g in games}),
        "replays_parsed": sum(1 for g in games if g.replay_status == "parsed"),
        "members": member_summary(games),
    }


def player_row(p: GamePlayer, full: bool = False) -> dict:
    row = {
        "profile_id": p.profile_id,
        "name": p.name,
        "is_member": p.is_member,
        "team": p.team,
        "slot": p.slot,
        "color": p.color,
        "civ": p.civ,
        "civ_name": p.civ_name,
        "rating": p.rating,
        "rating_diff": p.rating_diff,
        "won": p.won,
        "eapm": p.eapm,
        "feudal_s": p.feudal_s,
        "castle_s": p.castle_s,
        "imperial_s": p.imperial_s,
        "resign_s": p.resign_s,
        "first_military_s": p.first_military_s,
        "villagers_queued": p.villagers_queued,
        "military_queued": p.military_queued,
        "town_centers_built": p.town_centers_built,
        "techs_researched": p.techs_researched,
    }
    if full:
        row["replay_stats"] = p.replay_stats
    return row


def game_row(g: Game, full: bool = False) -> dict:
    return {
        "match_id": g.match_id,
        "session_id": g.session_id,
        "started_at": _utc(g.started_at),
        "finished_at": _utc(g.finished_at),
        "duration_real_s": g.duration_real_s,
        "duration_game_s": g.duration_game_s,
        "speed_factor": g.speed_factor,
        "map": g.map_name,
        "map_slug": g.map_slug,
        "map_size": g.map_size,
        "leaderboard": g.leaderboard,
        "patch": g.patch,
        "won": g.won,
        "our_team": g.our_team,
        "replay_status": g.replay_status,
        "players": [player_row(p, full) for p in sorted(g.players, key=lambda p: (p.team != g.our_team, p.slot or 0))],
    }
