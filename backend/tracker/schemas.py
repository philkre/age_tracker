"""API response models (source of the OpenAPI schema the frontend types are generated from)."""

from datetime import datetime

from pydantic import BaseModel


class Member(BaseModel):
    name: str
    profile_id: int


class MemberSummary(BaseModel):
    name: str
    profile_id: int
    games: int
    wins: int
    rating_start: int | None
    rating_end: int | None
    rating_delta: int | None
    civs: list[str]
    avg_eapm: float | None
    avg_feudal_s: float | None
    best_feudal_s: float | None
    avg_castle_s: float | None
    best_castle_s: float | None
    villagers_queued: int
    military_queued: int


class SessionSummary(BaseModel):
    id: int
    started_at: datetime
    ended_at: datetime
    games: int
    wins: int
    losses: int
    results: list[bool | None]  # per game, in order
    play_time_s: float
    durations_s: list[float]  # real-time length per game, in order
    game_ids: list[int]  # match ids, in order
    game_maps: list[str]  # map name per game
    game_parsed: list[bool]  # replay analysed (heatmap available) per game
    team_rating_path: list[float | None]  # our avg rating before game 1, then after each game
    opp_ratings: list[float | None]  # opponents' avg rating per game
    maps: list[str]
    replays_parsed: int
    members: list[MemberSummary]


class ReplayStats(BaseModel):
    units: dict[str, int]
    buildings: dict[str, int]
    techs: list[dict]
    actions: dict[str, int]
    timeseries: list[list[float]]


class GamePlayerOut(BaseModel):
    profile_id: int
    name: str
    is_member: bool
    team: int
    slot: int | None
    color: int | None
    civ: str
    civ_name: str
    rating: int | None
    rating_diff: int | None
    won: bool | None
    eapm: int | None
    feudal_s: float | None
    castle_s: float | None
    imperial_s: float | None
    resign_s: float | None
    first_military_s: float | None
    villagers_queued: int | None
    military_queued: int | None
    town_centers_built: int | None
    techs_researched: int | None
    replay_stats: ReplayStats | None = None


class GameOut(BaseModel):
    match_id: int
    session_id: int | None
    started_at: datetime
    finished_at: datetime | None
    duration_real_s: float | None
    duration_game_s: float | None
    speed_factor: float | None
    map: str
    map_slug: str
    map_size: int | None
    leaderboard: str
    patch: int | None
    won: bool | None
    our_team: int
    replay_status: str
    players: list[GamePlayerOut]


class SessionDetail(SessionSummary):
    game_list: list[GameOut]


class SessionPage(BaseModel):
    items: list[SessionSummary]
    total: int
    offset: int
    limit: int


class Health(BaseModel):
    ok: bool


class Queued(BaseModel):
    queued: bool


class GameMapOut(BaseModel):
    dimension: int  # map tiles per side
    scale: int  # tiles per minimap cell
    alphabet: str
    palette: list[str]  # cell colours; terrain chars index into this via alphabet
    terrain: str  # one char per cell, row-major
    starts: dict[int, list[float]]  # profile_id -> [x, y]
    commands: dict[int, list[list[float]]]  # profile_id -> [[t_game_s, x, y, kind]], kind 0=move 1=order

