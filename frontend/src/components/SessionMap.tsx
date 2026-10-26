import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { gameMapQuery, type SessionSummary } from "../api/client";
import { MEMBERS } from "../lib/members";
import { HeatMinimap, type Marker } from "./HeatMinimap";

const MARKERS: Marker[] = MEMBERS.map((m) => ({ profileId: m.profileId, color: m.color }));
const SWIPE_PX = 30;

/** Games of a session that have heatmap data, in play order. */
export const parsedGames = (s: SessionSummary) => s.game_ids.map((_, i) => i).filter((i) => s.game_parsed[i]);

/** Default pick: the longest analysed game (usually the most action). */
export function defaultGame(s: SessionSummary): number {
  const idx = parsedGames(s);
  return idx.length ? idx.reduce((a, b) => (s.durations_s[b] > s.durations_s[a] ? b : a)) : 0;
}

/** Compact command heatmap for one game of a session; swipe / arrows step through the analysed games. */
export function SessionMap({
  s,
  index,
  onIndex,
}: {
  s: SessionSummary;
  index: number;
  onIndex: (i: number) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const inView = useInView(root);
  const qc = useQueryClient();
  const games = parsedGames(s);
  const pos = games.indexOf(index);
  const matchId = s.game_ids[index];
  const parsed = s.game_parsed[index];

  const q = useQuery({ ...gameMapQuery(matchId), enabled: inView && parsed });

  // Warm neighbours so swiping feels instant.
  useEffect(() => {
    if (!q.isSuccess || pos < 0) return;
    for (const j of [games[pos - 1], games[pos + 1]]) if (j != null) qc.prefetchQuery(gameMapQuery(s.game_ids[j]));
  }, [q.isSuccess, pos, games, qc, s.game_ids]);

  const points = useMemo(() => {
    if (!q.data) return [];
    const out: [number, number][] = [];
    for (const cmds of Object.values(q.data.commands)) for (const [, x, y] of cmds) out.push([x, y]);
    return out;
  }, [q.data]);

  const step = (d: number) => {
    if (!games.length) return;
    const next = games[(Math.max(pos, 0) + d + games.length) % games.length];
    onIndex(next);
  };

  // Horizontal swipe on touch / drag on desktop; suppress the click that follows a swipe.
  const start = useRef<number | null>(null);
  const swiped = useRef(false);

  if (games.length === 0) {
    return (
      <div ref={root} className="flex aspect-square items-center justify-center text-center text-xs text-faint">
        No replays analysed
      </div>
    );
  }

  return (
    <div ref={root} className="select-none">
      <div
        className="touch-pan-y"
        onPointerDown={(e) => {
          start.current = e.clientX;
          swiped.current = false;
        }}
        onPointerUp={(e) => {
          if (start.current == null) return;
          const dx = e.clientX - start.current;
          start.current = null;
          if (Math.abs(dx) > SWIPE_PX) {
            swiped.current = true;
            step(dx < 0 ? 1 : -1);
          }
        }}
        onClickCapture={(e) => {
          if (swiped.current) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
      >
        <Link
          to="/games/$matchId"
          params={{ matchId: String(matchId) }}
          draggable={false}
          aria-label={`Open game ${index + 1} on ${s.game_maps[index]}`}
          className="block rounded-lg focus-visible:outline-2 focus-visible:outline-gold"
        >
          {!parsed || q.isError ? (
            <div className="flex aspect-square w-full items-center justify-center p-3 text-center text-xs text-faint">
              No replay for this game
            </div>
          ) : q.data ? (
            <HeatMinimap data={q.data} points={points} markers={MARKERS} maxSize={208} markerRadius={3.5} />
          ) : (
            <div className="flex aspect-square w-full items-center justify-center">
              <div className="aspect-square w-[70%] rotate-45 animate-pulse rounded-sm bg-surface-2" />
            </div>
          )}
        </Link>
      </div>

    </div>
  );
}

/** Game caption + stepper shown under the card map; rendered separately so the card can align it. */
export function SessionMapNav({
  s,
  index,
  onIndex,
  className = "",
}: {
  s: SessionSummary;
  index: number;
  onIndex: (i: number) => void;
  className?: string;
}) {
  const games = parsedGames(s);
  if (!games.length) return null;
  const pos = games.indexOf(index);
  const step = (d: number) => onIndex(games[(Math.max(pos, 0) + d + games.length) % games.length]);
  const won = s.results[index];
  const multi = games.length > 1;
  return (
    <div className={`flex items-center justify-between gap-1 text-xs ${className}`}>
      {multi ? <Arrow label="Previous game" onClick={() => step(-1)}>‹</Arrow> : <span className="w-6" />}
      <div className="min-w-0 text-center leading-tight">
        <div className="truncate font-medium" title={s.game_maps[index]}>
          G{index + 1} · {s.game_maps[index]}
        </div>
        <div>
          <span className={won == null ? "text-muted" : won ? "text-win" : "text-loss"}>
            {won == null ? "Live" : won ? "Win" : "Loss"}
          </span>
          {multi && (
            <span className="tabular text-faint">
              {" "}
              · {pos + 1}/{games.length}
            </span>
          )}
        </div>
      </div>
      {multi ? <Arrow label="Next game" onClick={() => step(1)}>›</Arrow> : <span className="w-6" />}
    </div>
  );
}

function Arrow({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="grid h-6 w-6 place-items-center rounded-md text-base leading-none text-muted hover:bg-surface-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-gold"
    >
      {children}
    </button>
  );
}

/** True once the element has come within ~one screen of the viewport (then stays true). */
function useInView(ref: React.RefObject<HTMLElement | null>) {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) setSeen(true);
      },
      { rootMargin: "600px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, seen]);
  return seen;
}
