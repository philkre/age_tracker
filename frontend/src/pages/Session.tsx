import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Fragment, useMemo, useState } from "react";
import { ApiError, sessionQuery, type Game, type GamePlayer, type MemberSummary, type SessionDetail } from "../api/client";
import { ChallengeBadge, ChallengeCivsSection } from "../components/ChallengeBadge";
import { Chart, type ChartOption } from "../components/Chart";
import { Civ, Delta, ErrorBox, MemberDot, ResultStrip, Spinner, Stat, TimeModeToggle } from "../components/ui";
import { clock, date, hours, mapImage, pct, sessionTitle, time } from "../lib/format";
import { MEMBERS, memberColor } from "../lib/members";
import { useTimeMode } from "../lib/timeMode";

export function SessionPage({ sessionId }: { sessionId: number }) {
  const q = useQuery(sessionQuery(sessionId));
  if (q.isPending) return <Spinner />;
  if (q.isError) {
    if (q.error instanceof ApiError && q.error.status === 404)
      return <p className="py-16 text-center text-muted">Session not found.</p>;
    return <ErrorBox error={q.error} />;
  }
  const s = q.data;
  const avgGame = s.games ? s.play_time_s / s.games : 0;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/" className="text-sm text-muted hover:text-ink">
          ← All sessions
        </Link>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{sessionTitle(s.started_at)}</h1>
            <p className="tabular text-muted">
              {date(s.started_at)} · {time(s.started_at)}–{time(s.ended_at)}
            </p>
            {s.challenge && <ChallengeBadge c={s.challenge} className="mt-2" />}
          </div>
          <TimeModeToggle />
        </div>
      </div>

      <section className="grid grid-cols-2 gap-4 rounded-xl border border-line bg-surface p-4 sm:grid-cols-5 sm:p-5">
        <Stat label="Record" value={`${s.wins}–${s.losses}`} sub={`${pct(s.wins, s.wins + s.losses)} wins`} />
        <Stat label="Games" value={s.games} sub={<ResultStrip results={s.results} />} />
        <Stat label="Play time" value={hours(s.play_time_s)} />
        <Stat label="Avg game" value={clock(avgGame)} sub="real time" />
        <Stat label="Replays" value={`${s.replays_parsed}/${s.games}`} sub="analysed" />
      </section>

      {s.challenge && <ChallengeCivsSection c={s.challenge} />}

      <section className="rounded-xl border border-line bg-surface p-4 sm:p-5">
        <h2 className="mb-2 font-semibold">ELO over the session</h2>
        <EloChart session={s} />
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {s.members.map((m) => (
          <MemberCard key={m.profile_id} m={m} />
        ))}
      </section>

      <Splits games={s.game_list} />
    </div>
  );
}

function EloChart({ session }: { session: SessionDetail }) {
  const option = useMemo<ChartOption>(() => {
    const games = session.game_list;
    const labels = ["Start", ...games.map((_, i) => `G${i + 1}`)];
    const series = MEMBERS.map((m) => {
      const data: (number | null)[] = [null];
      let first = true;
      games.forEach((g) => {
        const p = g.players.find((p) => p.profile_id === m.profileId);
        if (first && p?.rating != null) {
          data[0] = p.rating;
          first = false;
        }
        data.push(p?.rating != null && p.rating_diff != null ? p.rating + p.rating_diff : null);
      });
      return {
        name: m.name,
        type: "line",
        data,
        connectNulls: true,
        symbolSize: 7,
        lineStyle: { width: 2.5 },
        itemStyle: { color: m.color },
        emphasis: { focus: "series" },
      };
    });

    return {
      backgroundColor: "transparent",
      grid: { left: 44, right: 12, top: 36, bottom: 28 },
      legend: { top: 0, textStyle: { color: "var(--color-muted)" }, icon: "circle", itemWidth: 9 },
      xAxis: {
        type: "category",
        data: labels,
        boundaryGap: false,
        axisLine: { lineStyle: { color: "var(--color-line)" } },
        axisLabel: { color: "var(--color-muted)" },
      },
      yAxis: {
        type: "value",
        scale: true,
        splitLine: { lineStyle: { color: "var(--color-grid)" } },
        axisLabel: { color: "var(--color-muted)" },
      },
      tooltip: {
        trigger: "axis",
        backgroundColor: "var(--color-surface)",
        borderColor: "var(--color-line)",
        textStyle: { color: "var(--color-ink)" },
        formatter: (params: { dataIndex: number; seriesName: string; value: number | null; color: string }[]) => {
          const i = params[0]?.dataIndex ?? 0;
          if (i === 0) return `<b>Start</b><br/>${rows(params, () => "")}`;
          const g = games[i - 1];
          const head = `<b>G${i} · ${g.map}</b> <span style="color:${g.won ? "var(--color-win)" : "var(--color-loss)"}">${
            g.won == null ? "" : g.won ? "Win" : "Loss"
          }</span>`;
          return `${head}<br/>${rows(params, (name) => {
            const p = g.players.find((p) => MEMBERS.find((m) => m.name === name)?.profileId === p.profile_id);
            return p ? ` <span style="opacity:.7">(${p.rating_diff! > 0 ? "+" : ""}${p.rating_diff}, ${p.civ_name})</span>` : "";
          })}`;
        },
      },
      series,
    };
  }, [session]);

  return <Chart option={option} className="h-64 w-full sm:h-72" />;
}

function rows(
  params: { seriesName: string; value: number | null; color: string }[],
  extra: (name: string) => string,
) {
  return params
    .filter((p) => p.value != null)
    .map(
      (p) =>
        `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p.color};margin-right:6px"></span>${p.seriesName}: <b>${p.value}</b>${extra(p.seriesName)}`,
    )
    .join("<br/>");
}

function MemberCard({ m }: { m: MemberSummary }) {
  const { convert } = useTimeMode();
  return (
    <div className="rounded-xl border border-line bg-surface p-4" style={{ borderTopColor: memberColor(m.profile_id), borderTopWidth: 2 }}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="truncate font-semibold">{m.name}</h3>
        <Delta value={m.rating_delta} />
      </div>
      <p className="tabular text-xs text-muted">
        {m.rating_start ?? "–"} → {m.rating_end ?? "–"} · {m.wins}/{m.games} won
      </p>
      <dl className="tabular mt-3 grid grid-cols-3 gap-2 text-sm">
        <div>
          <dt className="text-xs text-muted">eAPM</dt>
          <dd className="font-semibold">{m.avg_eapm ?? "–"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Best feudal</dt>
          <dd className="font-semibold">{clock(convert(m.best_feudal_s))}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Best castle</dt>
          <dd className="font-semibold">{clock(convert(m.best_castle_s))}</dd>
        </div>
      </dl>
    </div>
  );
}

type Metric = "civ" | "eapm" | "feudal" | "castle" | "elo";
const METRICS: { key: Metric; label: string; better: "min" | "max" | null }[] = [
  { key: "civ", label: "Civ", better: null },
  { key: "elo", label: "ELO ±", better: "max" },
  { key: "eapm", label: "eAPM", better: "max" },
  { key: "feudal", label: "Feudal", better: "min" },
  { key: "castle", label: "Castle", better: "min" },
];

function metricValue(p: GamePlayer | undefined, metric: Metric): number | null {
  if (!p) return null;
  switch (metric) {
    case "eapm":
      return p.eapm;
    case "feudal":
      return p.feudal_s;
    case "castle":
      return p.castle_s;
    case "elo":
      return p.rating_diff;
    case "civ":
      return null;
  }
}

type SortKey = "index" | "duration" | number; // number = member profile id
const member = (g: Game, profileId: number) => g.players.find((p) => p.profile_id === profileId);

function Splits({ games }: { games: Game[] }) {
  const { convert } = useTimeMode();
  const [metric, setMetric] = useState<Metric>("civ");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "index", dir: 1 });
  const [open, setOpen] = useState<number | null>(null);
  const meta = METRICS.find((m) => m.key === metric)!;

  const best = useMemo(() => {
    const out = new Map<number, number>();
    if (!meta.better) return out;
    for (const m of MEMBERS) {
      const vals = games.map((g) => metricValue(member(g, m.profileId), metric)).filter((v): v is number => v != null);
      if (vals.length > 1) out.set(m.profileId, meta.better === "min" ? Math.min(...vals) : Math.max(...vals));
    }
    return out;
  }, [games, metric, meta.better]);

  const rowsSorted = useMemo(() => {
    const indexed = games.map((g, i) => ({ g, i }));
    const value = ({ g, i }: { g: Game; i: number }): number | null =>
      sort.key === "index" ? i : sort.key === "duration" ? g.duration_real_s : metricValue(member(g, sort.key), metric);
    return indexed.sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      if (va == null) return 1;
      if (vb == null) return -1;
      return (va - vb) * sort.dir;
    });
  }, [games, sort, metric]);

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }));
  const arrow = (key: SortKey) => (sort.key === key ? (sort.dir === 1 ? " ↑" : " ↓") : "");

  const fmt = (v: number | null, p?: GamePlayer, g?: Game) => {
    if (metric === "civ") return p ? <Civ civ={p.civ} name={p.civ_name} /> : <span className="text-faint">–</span>;
    if (v == null) return <span className="text-faint">–</span>;
    if (metric === "elo") return <Delta value={v} />;
    if (metric === "eapm") return v;
    return clock(convert(v, g?.speed_factor));
  };

  return (
    <section className="rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line p-4">
        <h2 className="font-semibold">Splits</h2>
        <div className="flex flex-wrap gap-1" role="tablist">
          {METRICS.map((m) => (
            <button
              key={m.key}
              role="tab"
              aria-selected={metric === m.key}
              onClick={() => setMetric(m.key)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                metric === m.key ? "bg-gold text-bg" : "bg-surface-2 text-muted hover:text-ink"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="tabular w-full min-w-[560px] text-sm">
          <thead className="text-left text-[11px] uppercase tracking-wider text-muted">
            <tr>
              <Th onClick={() => toggleSort("index")}>#{arrow("index")}</Th>
              <th className="px-3 py-2 font-medium">Map</th>
              <Th onClick={() => toggleSort("duration")}>Length{arrow("duration")}</Th>
              {MEMBERS.map((m) => (
                <Th key={m.profileId} onClick={() => toggleSort(m.profileId)} align="center">
                  <span className="inline-flex items-center gap-1.5">
                    <MemberDot color={m.color} />
                    <span className="max-w-[7rem] truncate normal-case">{m.name}</span>
                    {arrow(m.profileId)}
                  </span>
                </Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rowsSorted.map(({ g, i }) => (
              <Fragment key={g.match_id}>
                <tr
                  onClick={() => setOpen(open === g.match_id ? null : g.match_id)}
                  className="cursor-pointer border-t border-line hover:bg-surface-2"
                  aria-expanded={open === g.match_id}
                >
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${g.won == null ? "bg-faint" : g.won ? "bg-win" : "bg-loss"}`} />
                      {i + 1}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-2">
                      <img src={mapImage(g.map_slug)} alt="" className="h-6 w-6 rounded-sm" loading="lazy" />
                      <span className="whitespace-nowrap">{g.map}</span>
                    </span>
                  </td>
                  <td className="px-3 py-2 text-muted">{clock(g.duration_real_s)}</td>
                  {MEMBERS.map((m) => {
                    const p = member(g, m.profileId);
                    const v = metricValue(p, metric);
                    const isBest = v != null && best.get(m.profileId) === v;
                    return (
                      <td key={m.profileId} className="px-3 py-2 text-center">
                        <span className={isBest ? "rounded bg-gold/15 px-1.5 py-0.5 font-semibold text-gold" : ""}>
                          {fmt(v, p, g)}
                        </span>
                      </td>
                    );
                  })}
                </tr>
                {open === g.match_id && (
                  <tr className="bg-bg/40">
                    <td colSpan={3 + MEMBERS.length} className="p-3 sm:p-4">
                      <GameDetail g={g} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-line px-4 py-2 text-xs text-faint">
        Click a column to sort, a row for all 8 players. Gold = best of the session.
      </p>
    </section>
  );
}

function Th({ children, onClick, align }: { children: React.ReactNode; onClick: () => void; align?: "center" }) {
  return (
    <th className={`px-3 py-2 font-medium ${align === "center" ? "text-center" : ""}`}>
      <button onClick={onClick} className="uppercase tracking-wider hover:text-ink">
        {children}
      </button>
    </th>
  );
}

function GameDetail({ g }: { g: Game }) {
  const { convert } = useTimeMode();
  const teams = [g.players.filter((p) => p.team === g.our_team), g.players.filter((p) => p.team !== g.our_team)];
  const t = (v: number | null) => clock(convert(v, g.speed_factor));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted">
          Started {time(g.started_at)} · {clock(g.duration_real_s)} real
          {g.duration_game_s != null && ` / ${clock(g.duration_game_s)} game`} · replay {g.replay_status}
        </p>
        <Link
          to="/games/$matchId"
          params={{ matchId: String(g.match_id) }}
          className="rounded-md bg-gold px-2.5 py-1 text-xs font-semibold text-bg hover:bg-gold/90"
        >
          Open game →
        </Link>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {teams.map((team, ti) => (
          <div key={ti} className="overflow-x-auto rounded-lg border border-line">
            <div className={`px-3 py-1.5 text-xs font-semibold ${ti === 0 ? "text-ink" : "text-muted"}`}>
              {ti === 0 ? "Us" : "Opponents"}
              {team[0]?.won != null && (
                <span className={team[0].won ? "text-win" : "text-loss"}> · {team[0].won ? "Won" : "Lost"}</span>
              )}
            </div>
            <table className="tabular w-full text-xs">
              <thead className="text-left text-muted">
                <tr>
                  <th className="px-3 py-1 font-medium">Player</th>
                  <th className="px-2 py-1 text-right font-medium">ELO</th>
                  <th className="px-2 py-1 text-right font-medium">eAPM</th>
                  <th className="px-2 py-1 text-right font-medium">Feudal</th>
                  <th className="px-2 py-1 text-right font-medium">Castle</th>
                  <th className="px-2 py-1 text-right font-medium">Imp</th>
                </tr>
              </thead>
              <tbody>
                {team.map((p) => (
                  <tr key={p.profile_id} className="border-t border-line/60">
                    <td className="px-3 py-1.5">
                      <span className="flex items-center gap-2">
                        <Civ civ={p.civ} name={p.civ_name} size={18} />
                        {p.is_member && <MemberDot color={memberColor(p.profile_id)} />}
                        <span className={`max-w-[10rem] truncate ${p.is_member ? "font-semibold" : ""}`}>{p.name}</span>
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-right whitespace-nowrap">
                      {p.rating ?? "–"} <Delta value={p.rating_diff} />
                    </td>
                    <td className="px-2 py-1.5 text-right">{p.eapm ?? "–"}</td>
                    <td className="px-2 py-1.5 text-right">{t(p.feudal_s)}</td>
                    <td className="px-2 py-1.5 text-right">{t(p.castle_s)}</td>
                    <td className="px-2 py-1.5 text-right">{t(p.imperial_s)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}
