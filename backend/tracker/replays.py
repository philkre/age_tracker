"""Download replays by match id and extract per-player stats with (patched) mgz."""

import io
import json
import logging
import math
import zipfile
from collections import Counter
from functools import cache
from pathlib import Path

import httpx
from sqlalchemy.orm import Session

from mgz.model import parse_match
from tracker.models import Game, GameMap, ReplayStatus

log = logging.getLogger(__name__)

REPLAY_URL = "https://aoe.ms/replay/"
MAX_ATTEMPTS = 5

# Queued units that are not military.
ECO_UNITS = frozenset({"Villager", "Fishing Ship", "Trade Cart", "Trade Cog", "Transport Ship"})
AGE_TECHS = frozenset({"Feudal Age", "Castle Age", "Imperial Age"})
AGE_FIELDS = {"FEUDAL_AGE": "feudal_s", "CASTLE_AGE": "castle_s", "IMPERIAL_AGE": "imperial_s"}

# Heatmap: positioned commands (0 = move, 1 = order: attack/gather/garrison on a target).
COMMAND_KINDS = {"MOVE": 0, "ORDER": 1}
# Minimap tiles per side, at most; bigger maps are downsampled.
MINIMAP_MAX_SIDE = 120
MINIMAP_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
UNKNOWN_TERRAIN_COLOR = "#5f7f45"


class ReplayNotFound(Exception):
    pass


def make_client() -> httpx.Client:
    return httpx.Client(timeout=120, follow_redirects=True, headers={"User-Agent": "aoe-tracker/0.1"})


def download_replay(client: httpx.Client, match_id: int, profile_ids: list[int], dest: Path) -> Path:
    """Try each player's POV until one is available. Raises ReplayNotFound if none."""
    for pid in profile_ids:
        resp = client.get(REPLAY_URL, params={"gameId": match_id, "profileId": pid})
        if resp.status_code == 404:
            continue
        resp.raise_for_status()
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(resp.content)
        return dest
    raise ReplayNotFound(match_id)


def _read_record(path: Path) -> io.BytesIO:
    with zipfile.ZipFile(path) as z:
        name = next(n for n in z.namelist() if n.endswith(".aoe2record"))
        return io.BytesIO(z.read(name))


def extract_stats(path: Path) -> dict:
    """Parse a replay zip into {duration_game_s, players: {profile_id: {...}}}."""
    match = parse_match(_read_record(path))

    per = {
        p.number: {
            "eapm": p.eapm,
            "feudal_s": None,
            "castle_s": None,
            "imperial_s": None,
            "resign_s": None,
            "first_military_s": None,
            "_units": Counter(),
            "_buildings": Counter(),
            "_techs": {},
            "_actions": Counter(),
            "_timeseries": [
                [r.timestamp.total_seconds(), r.total_resources, r.total_objects] for r in p.timeseries
            ],
        }
        for p in match.players
    }

    for u in match.uptimes:
        field = AGE_FIELDS.get(getattr(u.age, "name", str(u.age)))
        if field and u.player is not None and per[u.player.number][field] is None:
            per[u.player.number][field] = u.timestamp.total_seconds()

    for a in match.actions:
        if a.player is None or a.player.number not in per:
            continue
        s = per[a.player.number]
        t = a.timestamp.total_seconds()
        kind = a.type.name
        s["_actions"][kind] += 1
        if kind == "DE_QUEUE":
            unit = a.payload.get("unit")
            if unit:
                s["_units"][unit] += a.payload.get("amount") or 1
                if unit not in ECO_UNITS and s["first_military_s"] is None:
                    s["first_military_s"] = t
        elif kind == "BUILD":
            if b := a.payload.get("building"):
                s["_buildings"][b] += 1
        elif kind == "RESEARCH":
            tech = a.payload.get("technology")
            if tech and tech not in AGE_TECHS:
                s["_techs"].setdefault(tech, t)
        elif kind == "RESIGN" and s["resign_s"] is None:
            s["resign_s"] = t

    players = {}
    for p in match.players:
        s = per[p.number]
        units, buildings, techs = s.pop("_units"), s.pop("_buildings"), s.pop("_techs")
        s["villagers_queued"] = units.get("Villager", 0)
        s["military_queued"] = sum(n for u, n in units.items() if u not in ECO_UNITS)
        s["town_centers_built"] = buildings.get("Town Center", 0)
        s["techs_researched"] = len(techs)
        s["replay_stats"] = {
            "units": dict(units.most_common()),
            "buildings": dict(buildings.most_common()),
            "techs": [{"name": n, "t": t} for n, t in techs.items()],
            "actions": dict(s.pop("_actions").most_common()),
            "timeseries": s.pop("_timeseries"),
        }
        players[p.profile_id] = s

    return {
        "duration_game_s": match.duration.total_seconds(),
        "players": players,
        "map": extract_map(match),
    }


@cache
def _terrain_colors() -> dict[int, str]:
    """DE terrain id -> minimap colour, from aocref's dataset (same source mgz uses)."""
    import aocref

    path = Path(aocref.__file__).parent / "data" / "datasets" / "100.json"
    terrain = json.loads(path.read_text())["terrain"]
    return {int(k): v["colors"]["level"] for k, v in terrain.items()}


def extract_map(match) -> dict:
    """Terrain minimap (palette + one char per cell) and every positioned move/order command."""
    dim = match.map.dimension
    scale = max(1, math.ceil(dim / MINIMAP_MAX_SIDE))
    side = math.ceil(dim / scale)
    colors = _terrain_colors()

    # Majority-free downsampling: take the top-left tile of each scale x scale block.
    palette: list[str] = []
    index: dict[str, int] = {}
    cells = []
    for cy in range(side):
        for cx in range(side):
            tile = match.map.tiles[(cy * scale) * dim + cx * scale]
            color = colors.get(tile.terrain, UNKNOWN_TERRAIN_COLOR)
            if color not in index:
                index[color] = len(palette)
                palette.append(color)
            cells.append(MINIMAP_ALPHABET[index[color]])

    starts = {}
    for p in match.players:
        vils = [o.position for o in p.objects if o.name == "Villager" and o.position.x is not None]
        if vils:
            starts[p.profile_id] = [
                round(sum(v.x for v in vils) / len(vils), 1),
                round(sum(v.y for v in vils) / len(vils), 1),
            ]

    commands: dict[int, list] = {p.profile_id: [] for p in match.players}
    for a in match.actions:
        kind = COMMAND_KINDS.get(a.type.name)
        if kind is None or a.player is None or a.position is None or a.position.x is None:
            continue
        commands[a.player.profile_id].append(
            [round(a.timestamp.total_seconds()), round(a.position.x, 1), round(a.position.y, 1), kind]
        )

    return {
        "dimension": dim,
        "scale": scale,
        "alphabet": MINIMAP_ALPHABET,
        "palette": palette,
        "terrain": "".join(cells),
        "starts": starts,
        "commands": commands,
    }


def apply_stats(game: Game, stats: dict) -> None:
    game.duration_game_s = stats["duration_game_s"]
    if game.map_data is None:
        game.map_data = GameMap(data=stats["map"])
    else:
        game.map_data.data = stats["map"]
    for gp in game.players:
        s = stats["players"].get(gp.profile_id)
        if s:
            for key, value in s.items():
                setattr(gp, key, value)


def process_pending(db: Session, client: httpx.Client, replay_dir: Path, limit: int = 20) -> list[int]:
    """Download + parse replays for finished games. Returns parsed match ids."""
    games = (
        db.query(Game)
        .filter(
            Game.replay_status == ReplayStatus.PENDING,
            Game.finished_at.is_not(None),
            Game.replay_attempts < MAX_ATTEMPTS,
        )
        .order_by(Game.started_at.desc())
        .limit(limit)
        .all()
    )
    parsed = []
    for game in games:
        # Our POVs first, then everyone else's.
        pids = [p.profile_id for p in sorted(game.players, key=lambda p: not p.is_member)]
        path = replay_dir / f"{game.match_id}.zip"
        try:
            if not path.exists():
                download_replay(client, game.match_id, pids, path)
        except ReplayNotFound:
            game.replay_status = ReplayStatus.UNAVAILABLE
            db.commit()
            continue
        except httpx.HTTPError as e:
            game.replay_attempts += 1
            game.replay_error = f"download: {e}"
            log.warning("replay download failed for %s: %s", game.match_id, e)
            db.commit()
            continue

        game.replay_path = str(path)
        try:
            apply_stats(game, extract_stats(path))
        except Exception as e:  # mgz raises all sorts on format changes
            game.replay_status = ReplayStatus.FAILED
            game.replay_error = f"parse: {type(e).__name__}: {e}"
            log.warning("replay parse failed for %s: %s", game.match_id, e)
        else:
            game.replay_status = ReplayStatus.PARSED
            game.replay_error = None
            parsed.append(game.match_id)
        db.commit()
    return parsed


def reparse(db: Session, limit: int | None = None) -> list[int]:
    """Re-extract stats from already downloaded replays (after extractor changes)."""
    q = db.query(Game).filter(Game.replay_status == ReplayStatus.PARSED, Game.replay_path.is_not(None))
    done = []
    for game in q.limit(limit).all() if limit else q.all():
        try:
            apply_stats(game, extract_stats(Path(game.replay_path)))
        except Exception as e:
            log.warning("reparse failed for %s: %s", game.match_id, e)
            continue
        db.commit()
        done.append(game.match_id)
    return done

