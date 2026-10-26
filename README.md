# TopGun Training

Strava-style tracker for our weekly AoE2:DE ranked 4v4s (Cribbeltz, Maverick, Sundown, johannesnagel).

Games are imported automatically. There are no uploads and nothing to fill in.

## What it does

- **Sessions feed:** games are grouped into training nights (a gap of more than 3 h starts a new session). Each card shows the record, play time, best feudal, ELO change per player, one tile per game, and a command heatmap you can swipe through.
- **Session page:** ELO over the night, per-player cards, and a sortable splits table with all 8 players per game.
- **Game page:** scoreboard, age-up timeline, resources/objects over time, build/production/tech order, and a heatmap of where the action was.
- **Civ challenge ("Gotta play em all!"):** play all 56 ranked civs once as a team.
  - A live board while you play, plus "Roll civs" for the next game.
  - Badges on the sessions that ticked civs off.
  - A history of past challenges.

## How it works

```
aoe2companion match API ──▶ importer ──▶ SQLite ◀── FastAPI ◀── React SPA
aoe.ms replay download  ──▶ mgz parser ─┘
```

- **Match data:** matches (civs, teams, ELO, result) come from the aoe2companion API.
- **Replays:** downloaded per match, then parsed with a vendored and patched copy of `mgz` for eAPM, age-ups, production and command positions.
- **Sync interval:** a background loop syncs every 15 min, or every 90 s while a civ challenge is active.

## Run locally

```bash
cd backend && uv sync && uv run uvicorn tracker.main:create_app --factory --port 8000
```

```bash
cd frontend && npm install && npm run dev
```

Then open http://localhost:5173. The first sync runs on startup and imports the last 100 games per player.

Tests:

```bash
cd backend && uv run pytest
```

## Repo

| Path | What |
|---|---|
| `backend/` | FastAPI app, importer, grouping, replay parsing, civ challenge ([README](backend/README.md): endpoints, env vars) |
| `backend/vendor/mgz` | patched replay parser ([why](backend/vendor/mgz/VENDORED.md)) |
| `frontend/` | Vite + React + Tailwind + ECharts ([README](frontend/README.md)) |
| `docs/PLAN.md` | plan, decisions, roadmap |
| `docs/SPIKE.md` | data source findings (API, replay download, parser) |

## Deploying (planned)

One container: FastAPI serves `/api` and the built SPA (`TRACKER_STATIC_DIR=frontend/dist`), with a volume for `data/` (SQLite and replays).
