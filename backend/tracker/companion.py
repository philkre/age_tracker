"""Client for the aoe2companion match-history API."""

from datetime import datetime, timezone

import httpx

from tracker.config import LEADERBOARDS, MEMBER_IDS, MIN_MEMBERS_PER_GAME

BASE_URL = "https://data.aoe2companion.com/api"


def make_client() -> httpx.Client:
    return httpx.Client(base_url=BASE_URL, timeout=30, headers={"User-Agent": "aoe-tracker/0.1"})


def fetch_matches(client: httpx.Client, profile_id: int, page: int = 1, per_page: int = 100) -> list[dict]:
    """Matches for one profile, newest first."""
    resp = client.get("/matches", params={"profile_ids": profile_id, "page": page, "per_page": per_page})
    resp.raise_for_status()
    return resp.json()["matches"]


def parse_ts(value: str | None) -> datetime | None:
    """API timestamp -> naive UTC datetime."""
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc).replace(tzinfo=None)


def players(match: dict) -> list[dict]:
    return [p for t in match["teams"] for p in t["players"]]


def our_team(match: dict) -> int | None:
    """Team id with the most of us on it, if it reaches MIN_MEMBERS_PER_GAME."""
    best, best_count = None, 0
    for t in match["teams"]:
        count = sum(p["profileId"] in MEMBER_IDS for p in t["players"])
        if count > best_count:
            best, best_count = t["teamId"], count
    return best if best_count >= MIN_MEMBERS_PER_GAME else None


def is_training_game(match: dict) -> bool:
    return match.get("leaderboard") in LEADERBOARDS and our_team(match) is not None
