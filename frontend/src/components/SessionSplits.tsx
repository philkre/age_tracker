import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { SessionSummary } from "../api/client";
import { hours } from "../lib/format";

const TILE_REM = 4; // width of an average-length game; tiles never get narrower than this
const FADE_PX = 40;

/**
 * Strava-style splits for a session: one tile per game, width proportional to its
 * length, tinted by result, with the team's average rating change inside.
 * Long sessions scroll sideways; the strip fades out at the edges where more games hide.
 */
export function SessionSplits({
  s,
  active,
  onSelect,
}: {
  s: SessionSummary;
  /** Highlighted game index (e.g. the one shown on the card's map). */
  active?: number;
  /** Makes tiles clickable. */
  onSelect?: (i: number) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const n = s.durations_s.length;

  // Track which edges have hidden tiles behind them.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const update = () =>
      setEdges({ left: el.scrollLeft > 1, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1 });
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [n]);

  // Mouse wheel scrolls the strip sideways while there is room; at the ends the page scrolls.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || el.scrollWidth <= el.clientWidth) return;
      const canScroll = e.deltaY > 0 ? el.scrollLeft + el.clientWidth < el.scrollWidth - 1 : el.scrollLeft > 0;
      if (!canScroll) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [n]);

  // Keep the selected game in view (e.g. when stepping with the map arrows).
  useEffect(() => {
    const el = scroller.current;
    const tile = active != null ? el?.querySelector<HTMLElement>(`[data-i="${active}"]`) : null;
    if (!el || !tile) return;
    const left = tile.offsetLeft - (el.clientWidth - tile.offsetWidth) / 2;
    el.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
  }, [active]);

  if (n === 0) return null;
  const path = s.team_rating_path;
  const avg = s.play_time_s / n || 1;
  const mask = `linear-gradient(to right, ${edges.left ? "transparent" : "black"} 0, black ${
    edges.left ? FADE_PX : 0
  }px, black calc(100% - ${edges.right ? FADE_PX : 0}px), ${edges.right ? "transparent" : "black"} 100%)`;

  return (
    <div
      ref={scroller}
      className="mt-4 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      style={{ maskImage: mask, WebkitMaskImage: mask }}
    >
      <ol className="flex w-max min-w-full gap-1" aria-label="Games">
        {s.results.map((won, i) => {
          const before = path[i];
          const after = path[i + 1];
          const delta = before != null && after != null ? Math.round(after - before) : null;
          const ratio = (s.durations_s[i] || avg) / avg;
          const tone =
            won == null
              ? "bg-faint/15 text-muted"
              : won
                ? "bg-win/12 text-win before:bg-win"
                : "bg-loss/12 text-loss before:bg-loss";
          return (
            <li
              key={i}
              data-i={i}
              title={`Game ${i + 1} · ${won == null ? "in progress" : won ? "win" : "loss"} · ${hours(s.durations_s[i])}`}
              className={`split-in relative min-w-16 overflow-hidden rounded-lg px-2.5 pt-2 pb-1.5 before:absolute before:inset-x-0 before:top-0 before:h-0.5 ${tone} ${
                active === i ? "ring-2 ring-ink/70 ring-inset" : ""
              }`}
              style={{ flex: `${ratio} 0 ${ratio * TILE_REM}rem`, "--i": i } as CSSProperties}
            >
              <div className="tabular truncate text-sm leading-tight font-semibold">
                {delta == null ? "–" : delta > 0 ? `+${delta}` : delta}
              </div>
              <div className="tabular truncate text-[11px] text-muted">{hours(s.durations_s[i])}</div>
              {onSelect && (
                <button
                  type="button"
                  onClick={() => onSelect(i)}
                  aria-label={`Show game ${i + 1} on the map`}
                  aria-pressed={active === i}
                  className="absolute inset-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-gold"
                />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
