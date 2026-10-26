import type { SessionSummary } from "../api/client";
import { hours } from "../lib/format";
import { memberColor } from "../lib/members";

const W = 600;
const H = 100;
const PAD_Y = 12;
const MIN_GAME_SHARE = 0.06; // keep very short games visible

type Pt = [number, number];

/** Monotone cubic through the points (Fritsch–Carlson), so the line never overshoots a game's result. */
function monotonePath(pts: Pt[]): string {
  if (pts.length < 2) return "";
  const n = pts.length;
  const dx: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1][0] - pts[i][0]);
    m.push((pts[i + 1][1] - pts[i][1]) / (dx[i] || 1));
  }
  const t: number[] = [m[0]];
  for (let i = 1; i < n - 1; i++) t.push(m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2);
  t.push(m[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) {
      t[i] = t[i + 1] = 0;
      continue;
    }
    const a = t[i] / m[i];
    const b = t[i + 1] / m[i];
    const h = Math.hypot(a, b);
    if (h > 3) {
      t[i] = (3 * a * m[i]) / h;
      t[i + 1] = (3 * b * m[i]) / h;
    }
  }
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += ` C${pts[i][0] + h},${pts[i][1] + t[i] * h} ${pts[i + 1][0] - h},${pts[i + 1][1] - t[i + 1] * h} ${pts[i + 1][0]},${pts[i + 1][1]}`;
  }
  return d;
}

/** Fill gaps where a member sat out a game with their last known rating. */
function carryForward(path: (number | null)[]): number[] | null {
  const first = path.find((v) => v != null);
  if (first == null) return null;
  let last = first;
  return path.map((v) => (last = v ?? last));
}

/**
 * Strava-style "route" of a session: each member's rating relative to where they
 * started, drawn across the evening with x = cumulative play time.
 */
export function SessionRoute({ s }: { s: SessionSummary }) {
  const n = s.durations_s.length;
  if (n === 0) return null;

  // x positions: game boundaries proportional to play time.
  const total = s.durations_s.reduce((a, b) => a + b, 0) || n;
  const shares = s.durations_s.map((d) => Math.max((d || total / n) / total, MIN_GAME_SHARE));
  const shareSum = shares.reduce((a, b) => a + b, 0);
  const xs = [0];
  for (const sh of shares) xs.push(xs[xs.length - 1] + (sh / shareSum) * W);

  const lines = s.members
    .map((m) => {
      const path = carryForward(m.rating_path);
      return path && { id: m.profile_id, name: m.name, rel: path.map((v) => v - path[0]) };
    })
    .filter((l) => l != null);
  if (lines.length === 0) return null;

  const span = Math.max(8, ...lines.flatMap((l) => l.rel.map(Math.abs)));
  const y = (v: number) => H / 2 - (v / span) * (H / 2 - PAD_Y);

  return (
    <div className="route-reveal relative mt-4" aria-hidden>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block h-20 w-full sm:h-24">
        {s.results.map((won, i) => (
          <rect
            key={i}
            x={xs[i] + (i ? 1.5 : 0)}
            width={Math.max(xs[i + 1] - xs[i] - (i ? 1.5 : 0) - (i < n - 1 ? 1.5 : 0), 1)}
            y={0}
            height={H}
            rx={4}
            className={won == null ? "fill-faint/10" : won ? "fill-win/10" : "fill-loss/10"}
          >
            <title>{`Game ${i + 1} · ${won == null ? "in progress" : won ? "win" : "loss"} · ${hours(s.durations_s[i])}`}</title>
          </rect>
        ))}
        <line
          x1={0}
          x2={W}
          y1={H / 2}
          y2={H / 2}
          className="stroke-faint/60"
          strokeDasharray="3 4"
          vectorEffect="non-scaling-stroke"
        />
        {lines.map((l) => (
          <path
            key={l.id}
            d={monotonePath(l.rel.map((v, i) => [xs[i], y(v)]))}
            fill="none"
            stroke={memberColor(l.id)}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      {/* End markers in HTML so they stay round under the stretched viewBox. */}
      {lines.map((l) => (
        <span
          key={l.id}
          title={`${l.name}: ${l.rel[l.rel.length - 1] > 0 ? "+" : ""}${l.rel[l.rel.length - 1]}`}
          className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface"
          style={{
            left: "100%",
            top: `${(y(l.rel[l.rel.length - 1]) / H) * 100}%`,
            background: memberColor(l.id),
          }}
        />
      ))}
    </div>
  );
}
