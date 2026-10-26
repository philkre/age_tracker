import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { gameMapQuery, type Game, type GameMap as MapData, type GamePlayer } from "../api/client";
import { clock, playerColor } from "../lib/format";
import { useTimeMode } from "../lib/timeMode";

type Kind = "all" | "move" | "order";
const WINDOW_S = 120; // play-mode window, game seconds
const STEP_S = 10;

/** Minimap (diamond, like in-game) with a heatmap of where players sent move/order commands. */
export function CommandHeatmap({ g, players }: { g: Game; players: GamePlayer[] }) {
  const q = useQuery(gameMapQuery(g.match_id));
  const { convert } = useTimeMode();
  const end = Math.ceil(g.duration_game_s ?? 0);

  const [selected, setSelected] = useState<Set<number>>(() => new Set(players.map((p) => p.profile_id)));
  const [kind, setKind] = useState<Kind>("all");
  const [range, setRange] = useState<[number, number]>([0, end]);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setRange(([from]) => {
        const next = from + STEP_S;
        if (next + WINDOW_S > end) {
          setPlaying(false);
          return [Math.max(0, end - WINDOW_S), end];
        }
        return [next, next + WINDOW_S];
      });
    }, 120);
    return () => clearInterval(id);
  }, [playing, end]);

  const points = useMemo(() => {
    if (!q.data) return [];
    const out: [number, number][] = [];
    for (const [pid, cmds] of Object.entries(q.data.commands)) {
      if (!selected.has(Number(pid))) continue;
      for (const [t, x, y, k] of cmds) {
        if (t < range[0] || t > range[1]) continue;
        if (kind === "move" && k !== 0) continue;
        if (kind === "order" && k !== 1) continue;
        out.push([x, y]);
      }
    }
    return out;
  }, [q.data, selected, range, kind]);

  const setTeam = (team: "all" | "us" | "them") =>
    setSelected(
      new Set(
        players
          .filter((p) => team === "all" || (team === "us") === (p.team === g.our_team))
          .map((p) => p.profile_id),
      ),
    );
  const toggle = (pid: number) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(pid)) n.delete(pid);
      else n.add(pid);
      return n;
    });
  const fmt = (t: number) => clock(convert(t, g.speed_factor));

  return (
    <section className="rounded-xl border border-line bg-surface">
      <div className="border-b border-line p-4">
        <h2 className="font-semibold">Where the action was</h2>
        <p className="text-xs text-muted">
          Heatmap of every move and order command players sent (replays don't record kills). Hot spots late in the
          game are usually fights; press play to watch it move.
        </p>
      </div>

      {q.isPending ? (
        <div className="p-8 text-center text-sm text-muted">Loading map…</div>
      ) : q.isError ? (
        <div className="p-8 text-center text-sm text-muted">Map data not available for this game.</div>
      ) : (
        <div className="grid grid-cols-1 gap-5 p-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <MapCanvas data={q.data} points={points} players={players} selected={selected} />

          <div className="space-y-4 text-sm">
            <Field label="Players">
              <div className="mb-2 flex gap-1">
                {(["all", "us", "them"] as const).map((t) => (
                  <Pill key={t} onClick={() => setTeam(t)}>
                    {t === "all" ? "All" : t === "us" ? "Us" : "Them"}
                  </Pill>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {players.map((p) => (
                  <button
                    key={p.profile_id}
                    onClick={() => toggle(p.profile_id)}
                    aria-pressed={selected.has(p.profile_id)}
                    className={`flex max-w-[9rem] items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-opacity ${
                      selected.has(p.profile_id) ? "border-line text-ink" : "border-transparent text-faint opacity-60"
                    }`}
                  >
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: playerColor(p.color) }} />
                    <span className="truncate">{p.name}</span>
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Commands">
              <div className="flex gap-1">
                {(
                  [
                    ["all", "All"],
                    ["move", "Moves"],
                    ["order", "Orders"],
                  ] as const
                ).map(([k, label]) => (
                  <Pill key={k} active={kind === k} onClick={() => setKind(k)}>
                    {label}
                  </Pill>
                ))}
              </div>
              <p className="mt-1 text-xs text-faint">Orders = right-click on a target (attack, gather, garrison).</p>
            </Field>

            <Field label={`Time · ${fmt(range[0])}–${fmt(range[1])}`}>
              <RangeSlider max={end} value={range} onChange={(r) => (setPlaying(false), setRange(r))} />
              <div className="mt-2 flex flex-wrap gap-1">
                <Pill
                  active={playing}
                  onClick={() => {
                    if (!playing && range[1] - range[0] !== WINDOW_S) setRange([0, WINDOW_S]);
                    setPlaying(!playing);
                  }}
                >
                  {playing ? "❚❚ Pause" : "▶ Play"}
                </Pill>
                <Pill onClick={() => (setPlaying(false), setRange([0, end]))}>Whole game</Pill>
              </div>
            </Field>

            <p className="tabular text-xs text-muted">{points.length.toLocaleString()} commands shown</p>
          </div>
        </div>
      )}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-medium text-muted">{label}</div>
      {children}
    </div>
  );
}

function Pill({ active, onClick, children }: { active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
        active ? "bg-gold text-bg" : "bg-surface-2 text-muted hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function RangeSlider({
  max,
  value,
  onChange,
}: {
  max: number;
  value: [number, number];
  onChange: (v: [number, number]) => void;
}) {
  const [a, b] = value;
  const cls =
    "pointer-events-none absolute inset-x-0 top-0 h-5 w-full appearance-none bg-transparent accent-[var(--color-gold)] [&::-webkit-slider-thumb]:pointer-events-auto [&::-moz-range-thumb]:pointer-events-auto";
  return (
    <div className="relative h-5">
      <div className="absolute inset-x-0 top-2 h-1 rounded-full bg-surface-2" />
      <div
        className="absolute top-2 h-1 rounded-full bg-gold/60"
        style={{ left: `${(100 * a) / max}%`, right: `${100 - (100 * b) / max}%` }}
      />
      <input
        type="range"
        min={0}
        max={max}
        step={STEP_S}
        value={a}
        aria-label="From"
        onChange={(e) => onChange([Math.min(Number(e.target.value), b - STEP_S), b])}
        className={cls}
      />
      <input
        type="range"
        min={0}
        max={max}
        step={STEP_S}
        value={b}
        aria-label="To"
        onChange={(e) => onChange([a, Math.max(Number(e.target.value), a + STEP_S)])}
        className={cls}
      />
    </div>
  );
}

const RAMP = buildRamp([
  [0, [255, 220, 100, 0]],
  [0.3, [255, 200, 60, 40]],
  [0.55, [255, 140, 30, 150]],
  [0.8, [235, 55, 30, 215]],
  [1, [255, 245, 230, 245]],
]);

function buildRamp(stops: [number, [number, number, number, number]][]) {
  const ramp = new Uint8ClampedArray(256 * 4);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    const j = stops.findIndex(([s]) => s >= t);
    const [s1, c1] = stops[Math.max(0, j - 1)];
    const [s2, c2] = stops[Math.max(0, j)];
    const f = s2 === s1 ? 0 : (t - s1) / (s2 - s1);
    for (let k = 0; k < 4; k++) ramp[i * 4 + k] = c1[k] + (c2[k] - c1[k]) * f;
  }
  return ramp;
}

const HEAT_RES = 2; // density cells per map tile
const KERNEL_TILES = 4; // blur radius

function MapCanvas({
  data,
  points,
  players,
  selected,
}: {
  data: MapData;
  points: [number, number][];
  players: GamePlayer[];
  selected: Set<number>;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(320);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize(Math.min(640, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Terrain bitmap: one pixel per minimap cell.
  const terrain = useMemo(() => {
    const side = Math.ceil(data.dimension / data.scale);
    const c = document.createElement("canvas");
    c.width = c.height = side;
    const ctx = c.getContext("2d")!;
    const img = ctx.createImageData(side, side);
    const rgb = data.palette.map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));
    for (let i = 0; i < data.terrain.length; i++) {
      const [r, g, b] = rgb[data.alphabet.indexOf(data.terrain[i])] ?? [90, 120, 70];
      img.data.set([r, g, b, 255], i * 4);
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }, [data]);

  // Heat bitmap in tile space: gaussian density grid, log-scaled and normalised to its own max,
  // so both the whole game and a 2-minute window show clear hot spots.
  const heat = useMemo(() => {
    const n = data.dimension * HEAT_RES;
    const density = new Float32Array(n * n);
    const r = KERNEL_TILES * HEAT_RES;
    const kernel: number[] = [];
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) kernel.push(Math.exp(-(dx * dx + dy * dy) / (2 * (r / 2) ** 2)));
    for (const [x, y] of points) {
      const cx = Math.round(x * HEAT_RES);
      const cy = Math.round(y * HEAT_RES);
      let k = 0;
      for (let dy = -r; dy <= r; dy++) {
        const yy = cy + dy;
        for (let dx = -r; dx <= r; dx++, k++) {
          const xx = cx + dx;
          if (xx < 0 || yy < 0 || xx >= n || yy >= n) continue;
          density[yy * n + xx] += kernel[k];
        }
      }
    }
    let max = 0;
    for (const v of density) if (v > max) max = v;
    const c = document.createElement("canvas");
    c.width = c.height = n;
    if (!max) return c;
    const ctx = c.getContext("2d")!;
    const img = ctx.createImageData(n, n);
    const norm = Math.log1p(max);
    for (let i = 0; i < density.length; i++) {
      const v = density[i];
      if (v < 0.05) continue;
      const a = Math.min(255, Math.round((255 * Math.log1p(v)) / norm));
      img.data.set(RAMP.subarray(a * 4, a * 4 + 4), i * 4);
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }, [data.dimension, points]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.height = size * dpr;
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);

    // Diamond like the in-game minimap: tile (0,0) on the left corner.
    const L = size / Math.SQRT2;
    ctx.save();
    ctx.translate(0, size / 2);
    ctx.rotate(-Math.PI / 4);
    ctx.scale(L / data.dimension, L / data.dimension);
    ctx.imageSmoothingEnabled = false;
    ctx.filter = "saturate(0.55) brightness(0.8)";
    ctx.drawImage(terrain, 0, 0, data.dimension, data.dimension);
    ctx.filter = "none";
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(heat, 0, 0, data.dimension, data.dimension);
    ctx.restore();

    // Start positions, drawn unrotated so the markers stay round.
    const toScreen = (x: number, y: number) => {
      const u = (x / data.dimension) * L;
      const v = (y / data.dimension) * L;
      return [(u + v) / Math.SQRT2, size / 2 + (v - u) / Math.SQRT2];
    };
    for (const p of players) {
      const s = data.starts[p.profile_id];
      if (!s) continue;
      const [sx, sy] = toScreen(s[0], s[1]);
      ctx.beginPath();
      ctx.arc(sx, sy, selected.has(p.profile_id) ? 6 : 4, 0, Math.PI * 2);
      ctx.fillStyle = playerColor(p.color);
      ctx.globalAlpha = selected.has(p.profile_id) ? 1 : 0.4;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(0,0,0,0.7)";
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }, [size, terrain, heat, data, players, selected]);

  return (
    <div ref={wrap} className="w-full min-w-0">
      <canvas
        ref={ref}
        style={{ width: size, height: size }}
        className="mx-auto block"
        role="img"
        aria-label="Map heatmap of player commands"
      />
      <p className="mt-2 text-center text-xs text-faint">Dots = starting positions</p>
    </div>
  );
}
