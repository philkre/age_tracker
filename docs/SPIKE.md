# Phase 0 Spike — Findings (2026-10-26)

**Verdict: fully automatic import works.** Match API + replay download + replay parsing all work for our games. No manual input or uploads needed.

## Players

| Name | In-game | profileId | steamId |
|---|---|---|---|
| Cribbeltz | `[TopGun]Cribbeltz` | 252396 | 76561198254436228 |
| Maverick | `[TopGun]Maverick` | 1308804 | — |
| Sundown | `[TopGun]Sundown` | 2645968 | 76561198809487396 |
| johannesnagel | `[TopGun]johnnynagel` | 249543 | — |

## 1. Match history — aoe2companion API ✅

`GET https://data.aoe2companion.com/api/matches?profile_ids=252396&per_page=100&page=N`

- Returns ranked `rm_team` games incl. all 8 players: civ, team, color, slot, `rating`, `ratingDiff`, `won`.
- Match meta: `matchId`, `started`, `finished`, `map`/`mapName`, `mapSize`, `patch`, `server`, `leaderboard`, `speedFactor` (1.7), lots of lobby settings.
- History goes back years (page 8 @ 100/page reached 2020).
- Last 30 games: **all 30 had all 4 of us together**, team RM. (That weekend was a training camp, not the norm — normal is one session per week.) Session = cluster of games separated by a time gap → weekly nights group naturally.
- TODO: confirm whether `rating` is pre- or post-game (compare consecutive games).

## 2. Replay download ✅

`GET https://aoe.ms/replay/?gameId={matchId}&profileId={profileId}` → 301 → `api.ageofempires.com/.../GetMatchReplay` → zip with `AgeIIDE_Replay_{matchId}.aoe2record` (~1.9 MB zip, ~3.5 MB raw).

- Works for each of our 4 POVs (one per game is enough).
- Retention: game from Feb 2026 (~8.5 months) ✅, 2022 game → 404 `Match not found.`. Backfill of this year possible; archive replays ourselves.

## 3. Replay parsing — `mgz` ⚠️ needs patch

- PyPI `mgz` 1.8.51 (latest, Feb 2026) **fails** on current patch replays (save version **68.9**, game patch 1815). Upstream master has no fix as of 2026-10-19.
- Root cause found: save 68.9 adds (a) an extra DE string at the end of every player record in the lobby header, (b) 8 extra bytes at the end of the DE header.
- Fix: [`patches/mgz-save-67.patch`](../patches/mgz-save-67.patch) (4 lines). With it, full parse succeeds; older save 66.6 replays still parse.
- Update (Phase 2): the same two changes already exist in save 67.2 (patch 1792) and 68.0 (patch 1800); gate lowered from 68.9 to 67.0.
- Plan: vendor/fork mgz with this patch, maybe PR upstream. Expect this to break again on future game patches → need a "parse failed" state + re-parse job.

### Available per player (verified on match 516462729)

| Field | Source | Notes |
|---|---|---|
| civ, team, color, profile_id | header | ✅ |
| eAPM | `player.eapm` | ✅ |
| age-up times (Feudal/Castle/Imp) | `match.uptimes` | ✅ game time |
| units queued by type | `DE_QUEUE` actions | ⚠️ *commands*, not units produced (cancels/spam inflate) |
| buildings placed by type | `BUILD` actions | ✅ (incl. 27 houses 🙃) |
| techs researched (ordered, timestamps) | `RESEARCH` actions | ⚠️ duplicates when re-clicked; dedupe |
| resign time per player | `RESIGN` actions | ✅ |
| chat | `match.chat` | ✅ |
| timeseries (`total_resources`, `total_objects`) every ~15s | `player.timeseries` | ✅ 124 points / 29 min |
| map, duration (game time), rated, starting positions | match | ✅ |
| winner | `player.winner` | ❌ unreliable (all False on old replay) → use API `won` |
| kills/losses, resources collected, score | — | ❌ not in DE replays (postgame screen data not recorded) |
| Action counts (move/order/flare/town bell…) | actions | ✅ fun stats |

Time note: replay duration is game time; real time = game time / 1.7.

## Impact on plan

- Manual input dropped for now (per decision).
- Ranked team RM only, no solo games: import only matches with ≥2 of our profile ids (likely always all 4).
- Results/ELO from API; deep stats from replay; replay is optional enrichment (game shows even if parse fails).
- Military K/D and score stats are **not** available — replaced with production/eco proxies (villagers queued, TC count, military queued, time to first military unit).

Spike scripts: [`spike/replay_stats.py`](../spike/replay_stats.py), [`spike/header_probe.py`](../spike/header_probe.py).
