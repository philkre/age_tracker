# AoE2 Training Tracker — Implementation Plan

Strava-style tracker for weekly AoE2:DE 4v4 sessions.
Players: **Cribbeltz, Maverick, Sundown, johannesnagel**.

Core idea: one **Session** (= Strava "activity") per training night, containing N **Games**.
Each game has per-player stats. Feed, profiles, trends and "segments"/PRs sit on top.

## Decisions (2026-10-26)

- **No manual input for now** — everything auto-imported (manual fields/kudos/comments deferred).
- **Ranked team RM only**, no solo games.
- **No uploads** — replays downloaded automatically by match id.
- Phase 0 spike done → see [SPIKE.md](SPIKE.md). Profile ids: Cribbeltz 252396, Maverick 1308804, Sundown 2645968, johannesnagel (`johnnynagel`) 249543.
- `mgz` needs a local patch for current replays (save 68.9) → vendor patched fork.
- Kill/loss/score stats are not in DE replays → use production/eco/timing stats instead.

---

## 1. Data sources (decides everything else)

| Source | What it gives | Effort |
|---|---|---|
| **Match-history API** (aoe2companion / World's Edge `aoe-api.worldsedgelink.com`) | match id, time, map, civs, teams, win/loss, ELO before/after, duration | Low — poll by profile id |
| **Replay files** (`.aoe2record`, parsed with Python lib `mgz` / aoc-mgz) | eAPM, age-up times, villager count over time, units/techs, resources, chat, map positions | Medium — need file upload or download from replay endpoint |
| **Manual input** | session mood, notes, strats tried, MVP vote, tags ("tilted", "new build order") | Trivial |

Plan: API for automatic skeleton, replays for deep stats, manual for "Strava caption" stuff.
**Phase 0 spike** verifies which endpoints currently work and whether replays can be fetched by match id (avoids everyone uploading files).

## 2. Domain model

```
Player        id, name, steam_id/profile_id, avatar, color
Session       id, date, title, description, started_at, ended_at, created_by
              -> derived: games played, W/L, total duration, avg ELO delta
Game          id, session_id, match_id (external), started_at, duration, map,
              map_size, game_mode (RM/EW), ladder (team RM / lobby / custom),
              result (win/loss), our_team_avg_elo, opp_team_avg_elo,
              replay_url/blob, parsed_at
GamePlayer    game_id, player_id (null for opponents), name, civ, color, team,
              position, elo_before, elo_after, won,
              -- replay-derived:
              eapm, feudal_time, castle_time, imperial_time,
              vils_at_10/20/30min, idle_tc_time, military_units_created,
              units_killed, units_lost, buildings_razed, techs_researched,
              resources_collected (food/wood/gold/stone), tributes_sent,
              market_trades, score (military/economy/tech/society)
GameEvent     game_id, player_id, t_seconds, type (age_up, wonder, resign,
              castle, first_military...), payload JSON   -- powers timelines
Comment/Kudos session_id, player_id, text / emoji
Tag           free-form on Session or Game ("pocket swap", "trash only test")
```

Opponents stored as `GamePlayer` without `player_id` → enables nemesis/rival stats later.

## 3. Features (by phase)

### Phase 0 — Spike (½ day)
- Look up profile ids for all 4 players.
- Hit match-history API, confirm 4v4 matches + team composition come back.
- Parse one real 4v4 replay with `mgz`, list which fields are available.
- Decide: replay download by match id vs. manual upload.

### Phase 1 — MVP: sessions from API
- "Start/close session" or auto-group: games where ≥2 of us played together within a time window (e.g. gaps < 2h) = one session.
- Importer job: poll API per player every ~10 min (or button "sync now"), dedupe by match id.
- Session page: header (date, W/L, duration, ELO delta per player), game list (map, civs, result, duration).
- Feed: reverse-chronological sessions, Strava-style cards.

### Phase 2 — Replay deep stats
- Replay ingest (auto-download or drag-drop upload) → parse in worker → fill `GamePlayer`/`GameEvent`.
- Per-game page: age-up timeline per player, villager curve, eAPM, army comp, score breakdown.
- Session "splits": per-game rows like Strava laps (feudal time, eAPM, K/D) with best values highlighted.

### Phase 3 — Strava social layer
- Kudos + comments on sessions; session title/description/photo (screenshot of post-game).
- MVP vote per session.
- Personal records: fastest feudal/castle, highest eAPM, longest win, biggest ELO gain → badges when broken ("🏆 New PR: Feudal 9:42").
- Achievements: streaks, "10 sessions", civ mastery.

### Phase 4 — Analytics
- Player profile: ELO graph, win rate by civ/map/position (flank vs pocket), age-up trends over time.
- Team view: win rate by lineup/positions, best civ combos, map pool performance.
- "Training load": games/week, hours, form trend (rolling win rate).
- Rivals: recurring opponents, record vs them.
- Weekly recap (optional Discord webhook post after session closes).

## 4. Tech stack (recommendation)

4 users → keep simple, one deployable.

- **Backend:** Python + FastAPI (needed anyway since `mgz` is Python). SQLAlchemy + Alembic.
- **DB:** Postgres (Supabase/Neon free tier) — or SQLite on a volume, fine for 4 users.
- **Jobs:** APScheduler inside app for API polling + replay parsing (no queue needed at this scale).
- **Frontend:** Next.js or SvelteKit + Tailwind; charts with Recharts/ECharts. Mobile-first (people check it on phone after the game).
- **Auth:** Discord OAuth or simple magic link; whitelist the 4 accounts.
- **Storage:** replays in S3-compatible bucket (R2/Supabase storage).
- **Hosting:** Fly.io / Railway (backend) + Vercel (frontend), or single container.

Repo layout:
```
backend/   app/{api,models,importers,replay,stats}  tests/
frontend/  app/{feed,session/[id],game/[id],player/[name]}
docs/
```

## 5. Key implementation details

- **Session grouping:** cluster matches containing ≥2 of the 4 profile ids; new session if gap > 2h from previous game. Allow manual merge/split.
- **Idempotency:** unique on `(external match_id)`; re-parse replay is safe (upsert).
- **Derived stats** computed on write into `session_stats` / `player_stats` tables (cheap reads for feed).
- **Civ/map names:** map ids → names via dataset from aoe2companion/`aoe2techtree` JSON, versioned per patch.
- **Testing:** fixture replays + recorded API responses (no live calls in tests); TDD on grouping, PR detection, stat derivation.

## 6. Milestones

1. Spike + data model + importer → see last week's session in the DB.
2. Feed + session page deployed → first real use after next game night.
3. Replay parsing + game page.
4. Kudos/comments/PRs.
5. Analytics dashboards.

## 7. Open questions

- Session grouping gap: 2h? (we sometimes play morning + evening same day → 2 sessions)
- Any must-have stat not listed (e.g. specific build order adherence)?
- Backfill: import all of 2026 (replays available ~8+ months back)?
