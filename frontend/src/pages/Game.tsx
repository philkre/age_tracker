import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ApiError, gameQuery, type Game, type GamePlayer } from "../api/client";
import { axisStyle, Chart, tooltipStyle, type ChartOption } from "../components/Chart";
import { Civ, Delta, ErrorBox, MemberDot, Spinner, Stat, TimeModeToggle } from "../components/ui";
import { clock, date, mapImage, minuteInterval, playerColor, time } from "../lib/format";
import { memberColor } from "../lib/members";
import { useTimeMode } from "../lib/timeMode";

type Tech = { name: string; t: number };

export function GamePage({ matchId }: { matchId: number }) {
  const q = useQuery(gameQuery(matchId));
  if (q.isPending) return <Spinner />;
  if (q.isError) {
    if (q.error instanceof ApiError && q.error.status === 404)
      return <p className="py-16 text-center text-muted">Game not found.</p>;
    return <ErrorBox error={q.error} />;
  }
  const g = q.data;
  // Our team first, then by slot.
  const players = [...g.players].sort((a, b) => Number(b.team === g.our_team) - Number(a.team === g.our_team));
  const parsed = g.replay_status === "parsed";
  const avg = (team: GamePlayer[]) => {
    const r = team.map((p) => p.rating).filter((v): v is number => v != null);
    return r.length ? Math.round(r.reduce((a, b) => a + b, 0) / r.length) : null;
  };
  const us = players.filter((p) => p.team === g.our_team);
  const them = players.filter((p) => p.team !== g.our_team);

  return (
    <div className="space-y-6">
      <div>
        {g.session_id != null ? (
          <Link to="/sessions/$sessionId" params={{ sessionId: String(g.session_id) }} className="text-sm text-muted hover:text-ink">
            ← Back to session
          </Link>
        ) : (
          <Link to="/" className="text-sm text-muted hover:text-ink">
            ← All sessions
          </Link>
        )}
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div className="flex items-center gap-3">
            <img src={mapImage(g.map_slug)} alt="" className="h-12 w-12 rounded-md sm:h-14 sm:w-14" />
            <div>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                {g.map}{" "}
                {g.won != null && <span className={g.won ? "text-win" : "text-loss"}>{g.won ? "Victory" : "Defeat"}</span>}
              </h1>
              <p className="tabular text-muted">
                {date(g.started_at)} · {time(g.started_at)}
              </p>
            </div>
          </div>
          <TimeModeToggle />
        </div>
      </div>

      <section className="grid grid-cols-2 gap-4 rounded-xl border border-line bg-surface p-4 sm:grid-cols-4 sm:p-5">
        <Stat label="Length" value={clock(g.duration_real_s)} sub={g.duration_game_s != null ? `${clock(g.duration_game_s)} game time` : "real time"} />
        <Stat label="Our avg ELO" value={avg(us) ?? "–"} />
        <Stat label="Their avg ELO" value={avg(them) ?? "–"} />
        <Stat label="Replay" value={g.replay_status} sub={g.patch ? `patch ${g.patch}` : undefined} />
      </section>

      <Scoreboard g={g} players={players} />

      {parsed ? (
        <>
          <section className="rounded-xl border border-line bg-surface p-4 sm:p-5">
            <h2 className="font-semibold">Age-up timeline</h2>
            <p className="mb-2 text-xs text-muted">Bars end at resign or game end. Hover for exact times.</p>
            <AgeTimeline g={g} players={players} />
          </section>
          <Timeseries g={g} players={players} />
          <Production g={g} players={players} />
        </>
      ) : (
        <p className="rounded-xl border border-line bg-surface p-6 text-muted">
          {g.replay_status === "pending"
            ? "Replay not analysed yet — it gets picked up on the next sync."
            : g.replay_status === "unavailable"
              ? "Replay no longer available for download."
              : "Replay could not be parsed (likely a new game patch)."}
        </p>
      )}
    </div>
  );
}

function PlayerName({ p }: { p: GamePlayer }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="h-3 w-1.5 shrink-0 rounded-full" style={{ background: playerColor(p.color) }} />
      <Civ civ={p.civ} name={p.civ_name} size={18} />
      {p.is_member && <MemberDot color={memberColor(p.profile_id)} />}
      <span className={`truncate ${p.is_member ? "font-semibold" : ""}`}>{p.name}</span>
    </span>
  );
}

const SCORE_COLS: { key: keyof GamePlayer; label: string; time?: boolean; better: "min" | "max" }[] = [
  { key: "eapm", label: "eAPM", better: "max" },
  { key: "feudal_s", label: "Feudal", time: true, better: "min" },
  { key: "castle_s", label: "Castle", time: true, better: "min" },
  { key: "imperial_s", label: "Imp", time: true, better: "min" },
  { key: "first_military_s", label: "1st mil.", time: true, better: "min" },
  { key: "villagers_queued", label: "Vils", better: "max" },
  { key: "military_queued", label: "Military", better: "max" },
  { key: "town_centers_built", label: "TCs", better: "max" },
  { key: "techs_researched", label: "Techs", better: "max" },
];

function Scoreboard({ g, players }: { g: Game; players: GamePlayer[] }) {
  const { convert } = useTimeMode();
  const best = useMemo(() => {
    const out = new Map<string, number>();
    for (const c of SCORE_COLS) {
      const vals = players.map((p) => p[c.key]).filter((v): v is number => typeof v === "number");
      if (vals.length) out.set(c.key, c.better === "min" ? Math.min(...vals) : Math.max(...vals));
    }
    return out;
  }, [players]);

  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface">
      <h2 className="border-b border-line p-4 font-semibold">Scoreboard</h2>
      <div className="overflow-x-auto">
        <table className="tabular w-full min-w-[760px] text-sm">
          <thead className="text-left text-[11px] uppercase tracking-wider text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Player</th>
              <th className="px-2 py-2 text-right font-medium">ELO</th>
              {SCORE_COLS.map((c) => (
                <th key={c.key} className="px-2 py-2 text-right font-medium">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {players.map((p, i) => (
              <tr
                key={p.profile_id}
                className={`border-t ${i > 0 && p.team !== players[i - 1].team ? "border-gold/40" : "border-line"} ${
                  p.team === g.our_team ? "" : "text-ink/80"
                }`}
              >
                <td className="max-w-[14rem] px-3 py-2">
                  <PlayerName p={p} />
                </td>
                <td className="px-2 py-2 text-right whitespace-nowrap">
                  {p.rating ?? "–"} <Delta value={p.rating_diff} />
                </td>
                {SCORE_COLS.map((c) => {
                  const v = p[c.key] as number | null;
                  const isBest = v != null && best.get(c.key) === v;
                  return (
                    <td key={c.key} className="px-2 py-2 text-right">
                      <span className={isBest ? "font-semibold text-gold" : ""}>
                        {v == null ? <span className="text-faint">–</span> : c.time ? clock(convert(v, g.speed_factor)) : v}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-line px-4 py-2 text-xs text-faint">
        Units/vils are queue commands from the replay (cancels count). Gold = best in the game.
      </p>
    </section>
  );
}

const AGES = [
  { name: "Dark", color: "#4a4339" },
  { name: "Feudal", color: "#7d6337" },
  { name: "Castle", color: "#b3852f" },
  { name: "Imperial", color: "#e8b54d" },
];

function AgeTimeline({ g, players }: { g: Game; players: GamePlayer[] }) {
  const { convert, mode } = useTimeMode();
  const option = useMemo<ChartOption>(() => {
    const rows = [...players].reverse(); // first player on top
    const c = (v: number | null) => convert(v, g.speed_factor);
    const segs = rows.map((p) => {
      const end = c(p.resign_s ?? g.duration_game_s) ?? 0;
      const marks = [0, c(p.feudal_s), c(p.castle_s), c(p.imperial_s)];
      return AGES.map((_, i) => {
        const start = marks[i];
        if (start == null) return 0;
        const next = marks.slice(i + 1).find((m) => m != null) ?? end;
        return Math.max(0, next - start);
      });
    });
    return {
      grid: { left: 8, right: 16, top: 30, bottom: 24, containLabel: true },
      legend: { top: 0, textStyle: { color: "var(--color-muted)" }, itemWidth: 12, itemHeight: 8 },
      xAxis: {
        type: "value",
        ...axisStyle,
        interval: minuteInterval(c(g.duration_game_s) ?? 0),
        axisLabel: { ...axisStyle.axisLabel, formatter: (v: number) => clock(v) },
      },
      yAxis: {
        type: "category",
        data: rows.map((p) => p.name),
        axisLine: axisStyle.axisLine,
        axisLabel: {
          color: "var(--color-muted)",
          width: 110,
          overflow: "truncate",
        },
      },
      tooltip: {
        ...tooltipStyle,
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (params: { dataIndex: number }[]) => {
          const p = rows[params[0].dataIndex];
          const t = (v: number | null) => clock(c(v));
          return [
            `<b>${p.name}</b> · ${p.civ_name}`,
            `Feudal: ${t(p.feudal_s)}`,
            `Castle: ${t(p.castle_s)}`,
            `Imperial: ${t(p.imperial_s)}`,
            p.resign_s != null ? `Resigned: ${t(p.resign_s)}` : "",
            `<span style="opacity:.6">${mode} time</span>`,
          ]
            .filter(Boolean)
            .join("<br/>");
        },
      },
      series: AGES.map((a, i) => ({
        name: a.name,
        type: "bar",
        stack: "age",
        barWidth: 14,
        itemStyle: { color: a.color },
        data: segs.map((s, ri) => ({
          value: s[i],
          itemStyle: { borderRadius: 0, opacity: rows[ri].team === g.our_team ? 1 : 0.6 },
        })),
      })),
    };
  }, [g, players, convert, mode]);

  return <Chart option={option} className="h-80 w-full" />;
}

function Timeseries({ g, players }: { g: Game; players: GamePlayer[] }) {
  const { convert } = useTimeMode();
  const [metric, setMetric] = useState<1 | 2>(1);
  const option = useMemo<ChartOption>(
    () => ({
      grid: { left: 8, right: 16, top: 56, bottom: 64, containLabel: true },
      legend: { top: 0, type: "scroll", textStyle: { color: "var(--color-muted)" }, icon: "roundRect", itemWidth: 12, itemHeight: 4 },
      xAxis: {
        type: "value",
        ...axisStyle,
        splitLine: { show: false },
        interval: minuteInterval(convert(g.duration_game_s, g.speed_factor) ?? 0),
        axisLabel: { ...axisStyle.axisLabel, formatter: (v: number) => clock(v), hideOverlap: true },
        max: "dataMax",
      },
      yAxis: { type: "value", ...axisStyle },
      tooltip: {
        ...tooltipStyle,
        trigger: "axis",
        order: "valueDesc",
        valueFormatter: (v: number) => String(Math.round(v)),
        axisPointer: { label: { formatter: (p: { value: number }) => clock(p.value) } },
      },
      dataZoom: [
        { type: "inside", filterMode: "none" },
        {
          type: "slider",
          height: 20,
          bottom: 12,
          borderColor: "var(--color-line)",
          fillerColor: "rgba(224,164,58,0.15)",
          textStyle: { color: "var(--color-muted)" },
          labelFormatter: (v: number) => clock(v),
        },
      ],
      series: players.map((p) => ({
        name: p.name,
        type: "line",
        showSymbol: false,
        sampling: "lttb",
        lineStyle: { width: p.is_member ? 2.5 : 1.5, type: p.team === g.our_team ? "solid" : "dashed" },
        itemStyle: { color: playerColor(p.color) },
        emphasis: { focus: "series" },
        data: (p.replay_stats?.timeseries ?? []).map((row) => [convert(row[0], g.speed_factor), row[metric]]),
      })),
    }),
    [g, players, metric, convert],
  );

  return (
    <section className="rounded-xl border border-line bg-surface p-4 sm:p-5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">Over time</h2>
          <p className="text-xs text-muted">Solid = us, dashed = opponents. Click legend to toggle, drag/scroll to zoom.</p>
        </div>
        <div className="flex gap-1" role="tablist">
          {(
            [
              [1, "Resources banked"],
              [2, "Object count"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              role="tab"
              aria-selected={metric === k}
              onClick={() => setMetric(k)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                metric === k ? "bg-gold text-bg" : "bg-surface-2 text-muted hover:text-ink"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <Chart option={option} className="h-80 w-full sm:h-96" />
      <p className="mt-1 text-xs text-faint">
        Approximate values from the replay sync stream: banked = unspent wood+food+gold+stone; objects include units,
        buildings and short-lived effects.
      </p>
    </section>
  );
}

function Production({ g, players }: { g: Game; players: GamePlayer[] }) {
  const { convert } = useTimeMode();
  const [selected, setSelected] = useState(players.find((p) => p.is_member)?.profile_id ?? players[0].profile_id);
  const p = players.find((x) => x.profile_id === selected) ?? players[0];
  const stats = p.replay_stats;
  const units = Object.entries(stats?.units ?? {});
  const buildings = Object.entries(stats?.buildings ?? {});
  const techs = (stats?.techs ?? []) as unknown as Tech[];
  const maxUnits = Math.max(1, ...units.map(([, n]) => n));
  const maxBuildings = Math.max(1, ...buildings.map(([, n]) => n));

  return (
    <section className="rounded-xl border border-line bg-surface">
      <div className="border-b border-line p-4">
        <h2 className="font-semibold">Build & production</h2>
        <div className="mt-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Player">
          {players.map((x) => (
            <button
              key={x.profile_id}
              role="tab"
              aria-selected={x.profile_id === selected}
              onClick={() => setSelected(x.profile_id)}
              className={`flex max-w-[11rem] items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${
                x.profile_id === selected ? "border-gold bg-gold/10 text-ink" : "border-line text-muted hover:text-ink"
              }`}
            >
              <span className="h-2.5 w-1 shrink-0 rounded-full" style={{ background: playerColor(x.color) }} />
              <span className="truncate">{x.name}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-6 p-4 md:grid-cols-3">
        <BarList title="Units queued" rows={units} max={maxUnits} color={playerColor(p.color)} />
        <BarList title="Buildings placed" rows={buildings} max={maxBuildings} color={playerColor(p.color)} />
        <div>
          <h3 className="mb-2 text-xs font-medium text-muted">Tech order</h3>
          {techs.length === 0 ? (
            <p className="text-sm text-faint">None</p>
          ) : (
            <ol className="tabular max-h-80 space-y-1 overflow-y-auto pr-1 text-sm">
              {techs.map((t) => (
                <li key={t.name} className="flex justify-between gap-3">
                  <span className="truncate">{t.name}</span>
                  <span className="text-muted">{clock(convert(t.t, g.speed_factor))}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </section>
  );
}

function BarList({ title, rows, max, color }: { title: string; rows: [string, number][]; max: number; color: string }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-medium text-muted">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-faint">None</p>
      ) : (
        <ul className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
          {rows.map(([name, n]) => (
            <li key={name} className="text-sm">
              <div className="flex justify-between gap-3">
                <span className="truncate">{name}</span>
                <span className="tabular text-muted">{n}</span>
              </div>
              <div className="mt-0.5 h-1.5 rounded-full bg-surface-2">
                <div className="h-full rounded-full" style={{ width: `${(100 * n) / max}%`, background: color, opacity: 0.8 }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
