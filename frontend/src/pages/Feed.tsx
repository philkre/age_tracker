import { useInfiniteQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { sessionsQuery, type SessionSummary } from "../api/client";
import { clock, date, hours, pct, sessionTitle, time } from "../lib/format";
import { memberColor } from "../lib/members";
import { useTimeMode } from "../lib/timeMode";
import { Delta, ErrorBox, MemberDot, ResultStrip, Spinner, Stat } from "../components/ui";

export function Feed() {
  const q = useInfiniteQuery(sessionsQuery);
  const sentinel = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = q;

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) fetchNextPage();
    });
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (q.isPending) return <Spinner />;
  if (q.isError) return <ErrorBox error={q.error} />;

  const sessions = q.data.pages.flatMap((p) => p.items);
  const total = q.data.pages[0]?.total ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="font-display text-2xl font-bold">Sessions</h1>
        <span className="text-sm text-muted">{total} total</span>
      </div>
      {sessions.length === 0 && (
        <p className="rounded-lg border border-line bg-surface p-6 text-muted">
          No sessions yet. They appear automatically after the next sync.
        </p>
      )}
      {sessions.map((s) => (
        <SessionCard key={s.id} s={s} />
      ))}
      <div ref={sentinel} />
      {isFetchingNextPage && <Spinner />}
      {hasNextPage && !isFetchingNextPage && (
        <button
          onClick={() => fetchNextPage()}
          className="w-full rounded-lg border border-line py-2 text-sm text-muted hover:text-ink"
        >
          Load more
        </button>
      )}
    </div>
  );
}

function SessionCard({ s }: { s: SessionSummary }) {
  const { convert } = useTimeMode();
  const bestFeudal = s.members
    .filter((m) => m.best_feudal_s != null)
    .sort((a, b) => a.best_feudal_s! - b.best_feudal_s!)[0];

  return (
    <Link
      to="/sessions/$sessionId"
      params={{ sessionId: String(s.id) }}
      className="block rounded-xl border border-line bg-surface p-4 transition-colors hover:border-gold/60 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-gold sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold">{sessionTitle(s.started_at)}</h2>
          <p className="tabular text-sm text-muted">
            {date(s.started_at)} · {time(s.started_at)}–{time(s.ended_at)}
          </p>
        </div>
        <ResultStrip results={s.results} />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4">
        <Stat label="Record" value={`${s.wins}–${s.losses}`} sub={`${pct(s.wins, s.wins + s.losses)} wins`} />
        <Stat label="Games" value={s.games} sub={`${s.replays_parsed} analysed`} />
        <Stat label="Play time" value={hours(s.play_time_s)} />
        <div className="hidden sm:block">
          <Stat
            label="Fastest feudal"
            value={bestFeudal ? clock(convert(bestFeudal.best_feudal_s)) : "–"}
            sub={bestFeudal?.name}
          />
        </div>
      </div>

      <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1.5 border-t border-line pt-3 text-sm sm:grid-cols-4">
        {s.members.map((m) => (
          <li key={m.profile_id} className="flex min-w-0 items-center gap-2">
            <MemberDot color={memberColor(m.profile_id)} />
            <span className="truncate">{m.name}</span>
            <span className="ml-auto">
              <Delta value={m.rating_delta} />
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {s.maps.map((m) => (
          <span key={m} className="rounded bg-surface-2 px-2 py-0.5 text-xs text-muted">
            {m}
          </span>
        ))}
      </div>
    </Link>
  );
}
