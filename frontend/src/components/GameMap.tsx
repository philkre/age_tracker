import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { HeatMinimap } from "./HeatMinimap";
import { gameMapQuery, type Game, type GamePlayer } from "../api/client";
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
          <div className="min-w-0">
            <HeatMinimap
              data={q.data}
              points={points}
              markers={players.map((p) => ({
                profileId: p.profile_id,
                color: playerColor(p.color),
                dim: !selected.has(p.profile_id),
              }))}
            />
            <p className="mt-2 text-center text-xs text-faint">Dots = starting positions</p>
          </div>

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
