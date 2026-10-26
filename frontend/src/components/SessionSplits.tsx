import type { CSSProperties } from "react";
import type { SessionSummary } from "../api/client";
import { hours } from "../lib/format";

/**
 * Strava-style splits for a session: one tile per game, width proportional to its
 * length, tinted by result, with the team's average rating change inside.
 */
export function SessionSplits({ s }: { s: SessionSummary }) {
  const n = s.durations_s.length;
  if (n === 0) return null;
  const path = s.team_rating_path;
  const avg = s.play_time_s / n || 1;

  return (
    <ol className="mt-4 flex gap-1" aria-label="Games">
      {s.results.map((won, i) => {
        const before = path[i];
        const after = path[i + 1];
        const delta = before != null && after != null ? Math.round(after - before) : null;
        const tone =
          won == null
            ? "bg-faint/15 text-muted"
            : won
              ? "bg-win/12 text-win before:bg-win"
              : "bg-loss/12 text-loss before:bg-loss";
        return (
          <li
            key={i}
            title={`Game ${i + 1} · ${won == null ? "in progress" : won ? "win" : "loss"} · ${hours(s.durations_s[i])}`}
            className={`split-in relative min-w-11 overflow-hidden rounded-lg px-2.5 pt-2 pb-1.5 before:absolute before:inset-x-0 before:top-0 before:h-0.5 ${tone}`}
            style={{ flex: `${(s.durations_s[i] || avg) / avg} 1 0`, "--i": i } as CSSProperties}
          >
            <div className="tabular truncate text-sm leading-tight font-semibold">
              {delta == null ? "–" : delta > 0 ? `+${delta}` : delta}
            </div>
            <div className="tabular truncate text-[11px] text-muted">{hours(s.durations_s[i])}</div>
          </li>
        );
      })}
    </ol>
  );
}
