import type { ReactNode } from "react";
import { civIcon } from "../lib/format";
import { useTimeMode } from "../lib/timeMode";

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted">{label}</div>
      <div className="tabular truncate text-xl font-semibold sm:text-2xl">{value}</div>
      {sub != null && <div className="tabular text-xs text-muted">{sub}</div>}
    </div>
  );
}

export function ResultStrip({ results }: { results: (boolean | null)[] }) {
  return (
    <div className="flex flex-wrap gap-1" aria-label="Game results">
      {results.map((r, i) => (
        <span
          key={i}
          title={`Game ${i + 1}: ${r == null ? "in progress" : r ? "win" : "loss"}`}
          className={`h-3 w-3 rounded-sm ${r == null ? "bg-faint" : r ? "bg-win" : "bg-loss"}`}
        />
      ))}
    </div>
  );
}

export function Civ({ civ, name, size = 20 }: { civ: string; name: string; size?: number }) {
  return (
    <img
      src={civIcon(civ)}
      alt={name}
      title={name}
      width={size}
      height={size}
      loading="lazy"
      className="inline-block shrink-0 rounded-sm"
    />
  );
}

export function Delta({ value }: { value: number | null | undefined }) {
  if (value == null) return <span className="text-faint">–</span>;
  const cls = value > 0 ? "text-win" : value < 0 ? "text-loss" : "text-muted";
  return <span className={`tabular font-semibold ${cls}`}>{value > 0 ? `+${value}` : value}</span>;
}

export function MemberDot({ color }: { color: string }) {
  return <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />;
}

export function TimeModeToggle() {
  const { mode, setMode } = useTimeMode();
  return (
    <div className="inline-flex rounded-md border border-line p-0.5 text-xs" role="group" aria-label="Time display">
      {(["game", "real"] as const).map((m) => (
        <button
          key={m}
          onClick={() => setMode(m)}
          aria-pressed={mode === m}
          className={`rounded px-2 py-1 transition-colors ${
            mode === m ? "bg-surface-2 text-ink" : "text-muted hover:text-ink"
          }`}
        >
          {m === "game" ? "Game time" : "Real time"}
        </button>
      ))}
    </div>
  );
}

export function Spinner() {
  return <div className="py-16 text-center text-muted">Loading…</div>;
}

export function ErrorBox({ error }: { error: unknown }) {
  return (
    <div className="rounded-lg border border-loss/40 bg-loss/10 p-4 text-sm">
      Couldn't load data: {error instanceof Error ? error.message : String(error)}
    </div>
  );
}
