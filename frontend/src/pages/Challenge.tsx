import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  ApiError,
  challengeByIdQuery,
  challengeQuery,
  challengesQuery,
  post,
  sessionsQuery,
  type Challenge,
  type ChallengeCiv,
  type ChallengeSummary,
} from "../api/client";
import { Civ, ErrorBox, MemberDot, Spinner, Stat } from "../components/ui";
import { date, time } from "../lib/format";
import { MEMBERS, memberColor } from "../lib/members";

export function ChallengePage() {
  const q = useQuery(challengeQuery);
  if (q.isPending) return <Spinner />;
  if (q.isError) return <ErrorBox error={q.error} />;
  const ch = q.data;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link to="/" className="text-sm text-muted hover:text-ink">
          ← All sessions
        </Link>
        <Link to="/challenges" className="text-sm text-muted hover:text-ink">
          Past challenges →
        </Link>
      </div>
      {ch?.active ? <ActiveHeader ch={ch} /> : <StartPanel previous={ch} />}
      {ch?.active && <RollCivs ch={ch} />}
      {ch && <Board ch={ch} />}
    </div>
  );
}

/** One challenge by id: live view while active, final result otherwise. */
export function ChallengeDetailPage({ id }: { id: number }) {
  const q = useQuery(challengeByIdQuery(id));
  if (q.isPending) return <Spinner />;
  if (q.isError) {
    if (q.error instanceof ApiError && q.error.status === 404)
      return <p className="py-16 text-center text-muted">Challenge not found.</p>;
    return <ErrorBox error={q.error} />;
  }
  const ch = q.data;
  return (
    <div className="space-y-6">
      <Link to="/challenges" className="text-sm text-muted hover:text-ink">
        ← All challenges
      </Link>
      {ch.active ? <ActiveHeader ch={ch} /> : <ResultHeader ch={ch} />}
      {ch.active && <RollCivs ch={ch} />}
      <Board ch={ch} />
    </div>
  );
}

export function ChallengeHistoryPage() {
  const q = useQuery(challengesQuery);
  if (q.isPending) return <Spinner />;
  if (q.isError) return <ErrorBox error={q.error} />;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link to="/" className="text-sm text-muted hover:text-ink">
          ← All sessions
        </Link>
        <Link to="/challenge" className="text-sm text-muted hover:text-ink">
          {q.data.some((c) => c.active) ? "Current challenge →" : "Start a challenge →"}
        </Link>
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">Civ challenges</h1>
      {q.data.length === 0 ? (
        <p className="rounded-xl border border-line bg-surface p-6 text-muted">No challenges yet.</p>
      ) : (
        <ul className="space-y-3">
          {q.data.map((c) => (
            <li key={c.id}>
              <HistoryCard c={c} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function statusOf(c: ChallengeSummary) {
  return c.active ? "Live" : c.completed_at ? "Completed" : "Ended";
}

function HistoryCard({ c }: { c: ChallengeSummary }) {
  const pct = Math.round((100 * c.used) / c.total);
  const status = statusOf(c);
  const end = c.completed_at ?? c.ended_at;
  return (
    <Link
      to="/challenge/$challengeId"
      params={{ challengeId: String(c.id) }}
      className="block rounded-xl border border-line bg-surface p-4 transition-colors hover:border-faint hover:bg-surface-2 sm:p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h2 className="truncate font-semibold">{c.name}</h2>
          <p className="tabular text-sm text-muted">
            {date(c.started_at)}
            {end ? ` – ${date(end)}` : " – now"}
          </p>
        </div>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
            status === "Live" ? "bg-win/12 text-win" : status === "Completed" ? "bg-gold/12 text-gold" : "bg-surface-2 text-muted"
          }`}
        >
          {status}
        </span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-gold" style={{ width: `${pct}%` }} />
      </div>
      <p className="tabular mt-2 text-sm text-muted">
        <span className="font-semibold text-ink">
          {c.used}/{c.total}
        </span>{" "}
        civs · {c.games} games · {c.wins}–{c.losses}
        {c.repeats > 0 && ` · ${c.repeats} repeats`}
      </p>
    </Link>
  );
}

function ResultHeader({ ch }: { ch: Challenge }) {
  const pct = Math.round((100 * ch.used) / ch.total);
  const end = ch.completed_at ?? ch.ended_at;
  return (
    <section className="rounded-xl border border-line bg-surface p-4 sm:p-5">
      <div className="text-xs font-medium text-muted">{ch.completed_at ? "Completed 🏆" : "Ended"}</div>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">{ch.name}</h1>
      <p className="tabular text-sm text-muted">
        {date(ch.started_at)} – {end ? date(end) : "now"}
      </p>
      <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-gold" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Civs" value={`${ch.used}/${ch.total}`} sub={ch.completed_at ? "all done" : `${ch.total - ch.used} left`} />
        <Stat label="Games" value={ch.games} sub={ch.repeats ? `${ch.repeats} repeat picks` : "no repeats"} />
        <Stat label="Record" value={`${ch.wins}–${ch.losses}`} />
        <Stat
          label="Top picker"
          value={[...ch.members].sort((a, b) => b.civs_used - a.civs_used)[0]?.name ?? "–"}
          sub={`${Math.max(0, ...ch.members.map((m) => m.civs_used))} civs`}
        />
      </div>
    </section>
  );
}

/* ---------- actions ---------- */

function useChallengeAction<T>(run: () => Promise<T>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: run,
    // Board, history list and the session badges all depend on challenges.
    onSuccess: () =>
      Promise.all(
        [["challenge"], ["challenges"], ["sessions"], ["session"]].map((queryKey) => qc.invalidateQueries({ queryKey })),
      ),
  });
}

/* ---------- start / header ---------- */

const DEFAULT_NAME = "Gotta play em all!";

function StartPanel({ previous }: { previous: Challenge | null }) {
  const sessions = useInfiniteQuery(sessionsQuery);
  const latest = sessions.data?.pages[0]?.items[0];
  // Offer to count tonight's games if the latest session ended within the last 3 hours.
  const tonight = latest && Date.now() - new Date(latest.ended_at).getTime() < 3 * 3600 * 1000 ? latest : undefined;
  const [name, setName] = useState(DEFAULT_NAME);
  const [includeTonight, setIncludeTonight] = useState(true);
  const start = useChallengeAction(() =>
    post<Challenge>("/challenge", {
      name,
      started_at: includeTonight && tonight ? tonight.started_at : undefined,
    }),
  );

  return (
    <section className="rounded-xl border border-line bg-surface p-4 sm:p-5">
      <h1 className="text-2xl font-semibold tracking-tight">Civ challenge</h1>
      <p className="mt-1 max-w-prose text-sm text-muted">
        Play every ranked civ once as a team. Every ranked team game after the start counts; a civ is ticked off as
        soon as one of us picks it. While a challenge runs, the board updates live during games.
      </p>
      {previous && (
        <p className="mt-2 text-sm text-muted">
          Last: <span className="text-ink">{previous.name}</span> · {previous.used}/{previous.total} civs ·{" "}
          {previous.completed_at ? "completed" : "ended"} {date(previous.completed_at ?? previous.ended_at!)}
        </p>
      )}

      <form
        className="mt-4 grid max-w-md gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          start.mutate();
        }}
      >
        <label className="block text-sm">
          <span className="text-xs font-medium text-muted">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={128}
            className="mt-1 block w-full rounded-md border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-gold"
          />
        </label>
        {tonight && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={includeTonight} onChange={(e) => setIncludeTonight(e.target.checked)} />
            Count tonight's {tonight.games} game{tonight.games === 1 ? "" : "s"} (since {time(tonight.started_at)})
          </label>
        )}
        {start.error && <p className="text-sm text-loss">{start.error.message}</p>}
        <button
          type="submit"
          disabled={start.isPending || !name.trim()}
          className="justify-self-start rounded-md bg-gold px-4 py-2 text-sm font-semibold text-bg disabled:opacity-50"
        >
          {start.isPending ? "Starting…" : "Start challenge"}
        </button>
      </form>
    </section>
  );
}

function ActiveHeader({ ch }: { ch: Challenge }) {
  const end = useChallengeAction(() => post<Challenge>("/challenge/end"));
  const pct = Math.round((100 * ch.used) / ch.total);
  return (
    <section className="rounded-xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-win">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-win opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-win" />
            </span>
            Live · updates every ~90s
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{ch.name}</h1>
          <p className="tabular text-sm text-muted">
            since {date(ch.started_at)} · {time(ch.started_at)}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <button
            onClick={() => {
              if (confirm(`End "${ch.name}" now? Progress is kept.`)) end.mutate();
            }}
            disabled={end.isPending}
            className="rounded-md border border-line px-3 py-1.5 text-xs text-muted hover:text-ink disabled:opacity-50"
          >
            End challenge
          </button>
          {end.error && <p className="text-xs text-loss">{end.error.message}</p>}
        </div>
      </div>

      <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-gold transition-[width] duration-700" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Civs" value={`${ch.used}/${ch.total}`} sub={`${ch.total - ch.used} to go`} />
        <Stat label="Games" value={ch.games} sub={ch.repeats ? `${ch.repeats} repeat picks` : "no repeats"} />
        <Stat label="Record" value={`${ch.wins}–${ch.losses}`} />
        <Stat label="Est. games left" value={Math.ceil((ch.total - ch.used) / MEMBERS.length)} sub="at 4 new civs/game" />
      </div>
    </section>
  );
}

/* ---------- roll ---------- */

function shuffle<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function RollCivs({ ch }: { ch: Challenge }) {
  const available = useMemo(() => ch.civs.filter((c) => !c.used), [ch.civs]);
  const [seed, setSeed] = useState(0);
  const [copied, setCopied] = useState(false);
  // Re-roll when asked or when the available pool changes (a game ticked civs off).
  const picks = useMemo(
    () => shuffle(available).slice(0, MEMBERS.length),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [available.map((c) => c.civ).join(), seed],
  );

  if (available.length === 0) return null;
  const text = MEMBERS.map((m, i) => `${m.name}: ${picks[i]?.name ?? "any"}`).join("\n");

  return (
    <section className="rounded-xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">Next game</h2>
          <p className="text-xs text-muted">Random unused civs, one each.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setSeed((s) => s + 1);
              setCopied(false);
            }}
            className="rounded-md bg-gold px-3 py-1.5 text-sm font-semibold text-bg"
          >
            🎲 Roll
          </button>
          <button
            onClick={() =>
              navigator.clipboard.writeText(text).then(
                () => setCopied(true),
                () => setCopied(false),
              )
            }
            className="rounded-md border border-line px-3 py-1.5 text-sm text-muted hover:text-ink"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
      <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {MEMBERS.map((m, i) => {
          const c = picks[i];
          return (
            <li key={m.profileId} className="flex min-w-0 items-center gap-3 rounded-lg bg-surface-2 p-3">
              {c ? (
                <Civ civ={c.civ} name={c.name} size={40} />
              ) : (
                <span className="grid h-10 w-10 place-items-center rounded bg-line text-faint">?</span>
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-xs text-muted">
                  <MemberDot color={m.color} />
                  <span className="truncate">{m.name}</span>
                </div>
                <div className="truncate font-semibold">{c?.name ?? "Any civ"}</div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ---------- board ---------- */

type Filter = "all" | "available" | "used";

function Board({ ch }: { ch: Challenge }) {
  const [filter, setFilter] = useState<Filter>(ch.active ? "all" : "used");
  const [player, setPlayer] = useState<number | null>(null);

  const civs = ch.civs.filter(
    (c) =>
      (filter === "all" || (filter === "used") === c.used) && (player == null || c.profile_id === player),
  );
  const counts = { all: ch.total, available: ch.total - ch.used, used: ch.used };

  return (
    <section className="rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
        <h2 className="font-semibold">Civs</h2>
        <div className="flex flex-wrap gap-1" role="tablist">
          {(["all", "available", "used"] as const).map((f) => (
            <button
              key={f}
              role="tab"
              aria-selected={filter === f}
              onClick={() => setFilter(f)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize ${
                filter === f ? "bg-gold text-bg" : "bg-surface-2 text-muted hover:text-ink"
              }`}
            >
              {f} <span className="tabular opacity-70">{counts[f]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 border-b border-line px-4 py-3">
        {ch.members.map((m) => (
          <button
            key={m.profile_id}
            onClick={() => {
              setPlayer(player === m.profile_id ? null : m.profile_id);
              if (filter === "available") setFilter("used");
            }}
            aria-pressed={player === m.profile_id}
            className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${
              player === m.profile_id ? "border-gold bg-gold/10 text-ink" : "border-line text-muted hover:text-ink"
            }`}
          >
            <MemberDot color={memberColor(m.profile_id)} />
            {m.name}
            <span className="tabular text-faint">
              {m.civs_used} · {m.wins}W
            </span>
          </button>
        ))}
      </div>

      {civs.length === 0 ? (
        <p className="p-6 text-center text-sm text-muted">Nothing here.</p>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-2 p-4">
          {civs.map((c) => (
            <CivTile key={c.civ} c={c} />
          ))}
        </ul>
      )}
    </section>
  );
}

function CivTile({ c }: { c: ChallengeCiv }) {
  const body = (
    <>
      <div className={c.used && !c.in_progress ? "opacity-45 grayscale" : ""}>
        <Civ civ={c.civ} name={c.name} size={40} />
      </div>
      <div className="mt-1.5 w-full truncate text-center text-xs font-medium">{c.name}</div>
      <div className="flex h-4 items-center gap-1 text-[11px]">
        {c.in_progress ? (
          <span className="font-semibold text-gold">live</span>
        ) : c.used ? (
          <>
            <MemberDot color={memberColor(c.profile_id!)} />
            <span className={c.won ? "text-win" : "text-loss"}>{c.won ? "W" : "L"}</span>
            {c.plays > 1 && <span className="text-faint">×{c.plays}</span>}
          </>
        ) : null}
      </div>
    </>
  );
  const cls = `flex flex-col items-center rounded-lg p-2 ${
    c.in_progress ? "bg-gold/10 ring-2 ring-gold" : c.used ? "bg-surface-2/60" : "bg-surface-2"
  }`;
  const title = c.used
    ? `${c.name} · ${c.player}${c.started_at ? ` · ${date(c.started_at)}` : ""} · ${
        c.in_progress ? "in progress" : c.won ? "win" : "loss"
      }`
    : `${c.name} · not played yet`;

  return (
    <li title={title}>
      {c.match_id ? (
        <Link to="/games/$matchId" params={{ matchId: String(c.match_id) }} className={`${cls} hover:ring-1 hover:ring-faint`}>
          {body}
        </Link>
      ) : (
        <div className={cls}>{body}</div>
      )}
    </li>
  );
}
