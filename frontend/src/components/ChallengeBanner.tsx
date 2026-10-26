import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { challengeQuery } from "../api/client";

const RECENT_MS = 7 * 24 * 3600 * 1000;

/** Feed header strip: live civ-challenge progress, a recent result, or a quiet way to start one. */
export function ChallengeBanner() {
  const { data: ch } = useQuery(challengeQuery);

  const finishedAt = ch?.completed_at ?? ch?.ended_at;
  const recent = ch && !ch.active && finishedAt && Date.now() - new Date(finishedAt).getTime() < RECENT_MS;

  if (!ch || (!ch.active && !recent)) {
    return (
      <Link
        to="/challenge"
        className="inline-flex items-center gap-2 rounded-lg bg-gold px-3.5 py-2 text-sm font-semibold text-bg shadow-sm transition-colors hover:bg-gold/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
      >
        <span aria-hidden>⚔</span>
        Start a civ challenge
      </Link>
    );
  }

  const pct = Math.round((100 * ch.used) / ch.total);
  return (
    <Link
      to="/challenge"
      className="block rounded-xl border border-line bg-surface p-4 transition-colors hover:border-faint hover:bg-surface-2"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="flex items-center gap-2 font-semibold">
          {ch.active && (
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-win opacity-60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-win" />
            </span>
          )}
          {ch.name}
          {!ch.active && <span className="text-sm font-normal text-muted">{ch.completed_at ? "· complete" : "· ended"}</span>}
        </div>
        <div className="tabular text-sm text-muted">
          <span className="font-semibold text-ink">
            {ch.used}/{ch.total}
          </span>{" "}
          civs · {ch.wins}–{ch.losses}
        </div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={ch.used} aria-valuemax={ch.total}>
        <div className="h-full rounded-full bg-gold transition-[width] duration-700" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-2 text-xs text-muted">{ch.active ? "Open the civ board →" : "See the result →"}</div>
    </Link>
  );
}
