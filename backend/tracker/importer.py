"""Upsert training games from the match-history API into the DB."""

import httpx
from sqlalchemy.orm import Session

from tracker import companion
from tracker.config import MEMBERS, MEMBER_IDS
from tracker.models import Game, GamePlayer


def import_matches(db: Session, matches: list[dict]) -> list[int]:
    """Upsert training games. Returns match ids that were new."""
    new_ids = []
    for m in matches:
        if not companion.is_training_game(m):
            continue
        game = db.get(Game, m["matchId"])
        if game is None:
            game = Game(match_id=m["matchId"])
            db.add(game)
            new_ids.append(m["matchId"])
        _apply_match(game, m)
    db.commit()
    return new_ids


def _apply_match(game: Game, m: dict) -> None:
    team = companion.our_team(m)
    game.started_at = companion.parse_ts(m["started"])
    game.finished_at = companion.parse_ts(m.get("finished"))
    game.leaderboard = m["leaderboard"]
    game.map_slug = m.get("map") or ""
    game.map_name = m.get("mapName") or game.map_slug
    game.map_size = m.get("mapSize")
    game.patch = m.get("patch")
    game.server = m.get("server")
    game.speed_factor = m.get("speedFactor")
    game.our_team = team
    game.raw = m

    by_profile = {p.profile_id: p for p in game.players}
    for p in companion.players(m):
        gp = by_profile.get(p["profileId"])
        if gp is None:
            gp = GamePlayer(profile_id=p["profileId"])
            game.players.append(gp)
        gp.is_member = p["profileId"] in MEMBER_IDS
        gp.name = p.get("name") or ""
        gp.civ = p.get("civ") or ""
        gp.civ_name = p.get("civName") or gp.civ
        gp.team = p["team"]
        gp.slot = p.get("slot")
        gp.color = p.get("color")
        gp.rating = p.get("rating")
        gp.rating_diff = p.get("ratingDiff")
        gp.won = p.get("won")

    ours = [p for p in game.players if p.team == team and p.won is not None]
    game.won = ours[0].won if ours else None


def sync_from_api(db: Session, client: httpx.Client, max_pages: int = 1) -> list[int]:
    """Pull recent matches for every member; returns newly imported match ids."""
    seen: dict[int, dict] = {}
    for member in MEMBERS:
        for page in range(1, max_pages + 1):
            matches = companion.fetch_matches(client, member.profile_id, page=page)
            for m in matches:
                seen.setdefault(m["matchId"], m)
            if len(matches) < 100:
                break
    return import_matches(db, sorted(seen.values(), key=lambda m: m["started"]))
