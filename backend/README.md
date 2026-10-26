# Backend

FastAPI + SQLite. Imports our ranked team games from aoe2companion, groups them into
training sessions, downloads replays and extracts stats with a vendored, patched `mgz`.

```
uv sync
uv run pytest
uv run uvicorn tracker.main:create_app --factory --port 8000
```

On startup a background loop syncs every `TRACKER_SYNC_INTERVAL_MINUTES` (default 15):
import matches → regroup sessions → parse up to 20 pending replays.

| Env var | Default | |
|---|---|---|
| `TRACKER_DATA_DIR` | `data` | SQLite DB + replay zips |
| `TRACKER_DATABASE_URL` | sqlite in data dir | |
| `TRACKER_SESSION_GAP_HOURS` | `3` | new session after this gap between games |
| `TRACKER_SYNC_ENABLED` | `1` | |
| `TRACKER_SYNC_INTERVAL_MINUTES` | `15` | |
| `TRACKER_CHALLENGE_SYNC_SECONDS` | `90` | sync interval while a civ challenge is active (live board) |
| `TRACKER_MAX_PAGES` | `1` | history pages (100 games) per member per sync; raise once for backfill |
| `TRACKER_ADMIN_TOKEN` | — | `Authorization: Bearer <token>` for `POST /api/sync`; unset = disabled |
| `TRACKER_STATIC_DIR` | — | built frontend (`frontend/dist`) served at `/` with SPA fallback |
| `TRACKER_CORS_ORIGINS` | `http://localhost:5173` | comma-separated; Vite dev server |

## Endpoints

- `GET /api/sessions` — feed, newest first (W/L, play time, maps, per-member ELO delta, eAPM, age-up bests)
- `GET /api/sessions/{id}` — summary + games with all 8 players
- `GET /api/games/{match_id}` — game incl. replay breakdowns (units, buildings, techs, actions, timeseries)
- `GET /api/games/{match_id}/map` — terrain minimap + every positioned move/order command (heatmap), ~140 KB gzipped well
- `POST /api/sync` — trigger sync now (admin token)
- `GET /api/challenge` — active civ challenge (else the latest one, else `null`) with per-civ status
- `GET /api/challenges`, `GET /api/challenges/{id}` — challenge history / one challenge
- `POST /api/challenge` `{name?, started_at?}` / `POST /api/challenge/end` — start/end a civ challenge (open, no token; default name "Gotta play em all!")
- `GET /api/players`, `GET /api/health`

## Notes

- Times from replays (`*_s`) are **game time**; divide by `speed_factor` (1.7) for real time.
- `rating` is pre-game; `rating + rating_diff` is post-game.
- After changing what gets extracted from replays, re-run it on the stored zips: `uv run python -m tracker.reparse`.
- Replays don't contain kills/deaths; the heatmap uses command positions as a proxy.
- Replay status: `pending` → `parsed` | `unavailable` (404, expired) | `failed` (mgz broke — likely new game patch; fix vendor/mgz, then reset to `pending`).
- macOS + Python 3.13 skips `.pth` files flagged hidden, so the editable install may not be on the path;
  `tracker/__init__.py` adds `vendor/` itself, and pytest uses `pythonpath = ["."]`.
