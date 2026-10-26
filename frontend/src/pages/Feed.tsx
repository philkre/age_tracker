import { useInfiniteQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { sessionsQuery, type SessionSummary } from "../api/client";
import { clock, date, hours, pct, sessionTitle, time } from "../lib/format";
import { memberColor } from "../lib/members";
import { useTimeMode } from "../lib/timeMode";
import { defaultGame, SessionMap, SessionMapNav } from "../components/SessionMap";
import { SessionSplits } from "../components/SessionSplits";
import { Delta, ErrorBox, MemberDot, Spinner, Stat } from "../components/ui";

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
        <h1 className="text-2xl font-semibold tracking-tight">Sessions</h1>
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
  const [game, setGame] = useState(() => defaultGame(s));
  const bestFeudal = s.members
    .filter((m) => m.best_feudal_s != null)
    .sort((a, b) => a.best_feudal_s! - b.best_feudal_s!)[0];

  // The title link is stretched over the whole card; map, arrows and tiles sit above it (z-10).
  // md+: everything on the left, map spanning the right. Mobile: header + stats beside the map,
  // tiles and members full width below.
  return (
    <article className="relative grid grid-cols-[minmax(0,1fr)_8rem] gap-x-4 gap-y-4 rounded-xl border border-line bg-surface p-4 transition-colors hover:border-faint hover:bg-surface-2 sm:grid-cols-[minmax(0,1fr)_12rem] sm:p-5 md:grid-cols-[minmax(0,1fr)_13rem] md:gap-x-6">
      <div className="min-w-0">
        <h2 className="line-clamp-2 text-lg leading-snug font-semibold sm:truncate">
          <Link
            to="/sessions/$sessionId"
            params={{ sessionId: String(s.id) }}
            className="after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-gold"
          >
            {sessionTitle(s.started_at)}
          </Link>
        </h2>
        <p className="tabular text-sm text-muted">
          {date(s.started_at)} · {time(s.started_at)}–{time(s.ended_at)}
        </p>
        <p className="mt-0.5 truncate text-xs text-faint" title={s.maps.join(", ")}>
          {s.maps.join(" · ")}
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Record" value={`${s.wins}–${s.losses}`} sub={`${pct(s.wins, s.wins + s.losses)} wins`} />
          <Stat label="Games" value={s.games} sub={`${s.replays_parsed} analysed`} />
          <Stat label="Play time" value={hours(s.play_time_s)} />
          <Stat
            label="Best feudal"
            value={bestFeudal ? clock(convert(bestFeudal.best_feudal_s)) : "–"}
            sub={bestFeudal?.name}
          />
        </div>
      </div>

      <div className="relative z-10 self-start md:col-start-2 md:row-span-2 md:row-start-1">
        <SessionMap s={s} index={game} onIndex={setGame} />
        <SessionMapNav s={s} index={game} onIndex={setGame} className="mt-1.5 md:hidden" />
      </div>

      <div className="relative z-10 col-span-2 -mt-4 md:col-span-1 md:col-start-1 md:row-start-2">
        <SessionSplits s={s} active={s.game_parsed[game] ? game : undefined} onSelect={setGame} />
      </div>

      <ul className="col-span-2 grid grid-cols-2 gap-x-4 gap-y-1.5 border-t border-line pt-3 text-sm md:col-span-1 md:col-start-1 md:row-start-3 lg:grid-cols-4">
        {s.members.map((m) => (
          <li key={m.profile_id} className="flex min-w-0 items-center gap-2" title={m.civs.join(", ")}>
            <MemberDot color={memberColor(m.profile_id)} />
            <span className="truncate">{m.name}</span>
            <span className="ml-auto">
              <Delta value={m.rating_delta} />
            </span>
          </li>
        ))}
      </ul>

      {/* md+: caption sits on the members row so both line up. */}
      <SessionMapNav
        s={s}
        index={game}
        onIndex={setGame}
        className="relative z-10 hidden border-t border-transparent pt-3 md:col-start-2 md:row-start-3 md:flex"
      />
    </article>
  );
}
