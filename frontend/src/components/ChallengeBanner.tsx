import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { challengeQuery } from "../api/client";

const RECENT_MS = 7 * 24 * 3600 * 1000;

/** Feed strip: live civ-challenge progress or a recent result. Starting one lives on the challenge page. */
export function ChallengeBanner() {
  const { data: ch } = useQuery(challengeQuery);

  const finishedAt = ch?.completed_at ?? ch?.ended_at;
  const recent = ch && !ch.active && finishedAt && Date.now() - new Date(finishedAt).getTime() < RECENT_MS;

  if (!ch || (!ch.active && !recent)) return null;

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
        <div className="h-full rounded-full bg-accent transition-[width] duration-700" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-2 text-xs text-muted">{ch.active ? "Open the civ board →" : "See the result →"}</div>
    </Link>
  );
}

/** Header nav entry for the civ challenge; shows live progress while one is running. */
export function ChallengeNavLink() {
  const { data: ch } = useQuery(challengeQuery);
  const live = ch?.active;

  return (
    <Link
      to="/challenge"
      aria-label={live ? `Civ challenge, ${ch.used} of ${ch.total} civs used` : undefined}
      className="flex items-center gap-2 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-bg shadow-sm transition-colors hover:bg-accent/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      {live && (
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-win opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-win" />
        </span>
      )}
      <span className={live ? "hidden sm:inline" : undefined}>Civ challenge</span>
      {live && (
        <span className="tabular rounded-md bg-bg/15 px-1.5 py-0.5 text-xs">
          {ch.used}/{ch.total}
        </span>
      )}
    </Link>
  );
}
