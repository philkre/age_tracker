const CDN = "https://backend.cdn.aoe2companion.com/public/aoe2/de";

export const civIcon = (civ: string) => `${CDN}/civilizations/${civ}.png`;
export const mapImage = (slug: string) => `${CDN}/maps/${slug}.png`;

/** 754 -> "12:34", 3725 -> "1:02:05" */
export function clock(seconds: number | null | undefined): string {
  if (seconds == null) return "–";
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

/** Axis tick spacing in seconds that lands on whole minutes (~6 ticks). */
export function minuteInterval(maxSeconds: number, ticks = 6): number {
  const raw = maxSeconds / 60 / ticks;
  const step = [1, 2, 5, 10, 15, 20, 30, 60].find((s) => s >= raw) ?? 60;
  return step * 60;
}

/** 7774 -> "2h 10m" */
export function hours(seconds: number): string {
  const m = Math.round(seconds / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}

export const signed = (n: number | null | undefined) => (n == null ? "–" : n > 0 ? `+${n}` : `${n}`);

const dayFmt = new Intl.DateTimeFormat("en-GB", { weekday: "long" });
const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
const timeFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });

export const weekday = (iso: string) => dayFmt.format(new Date(iso));
export const date = (iso: string) => dateFmt.format(new Date(iso));
export const time = (iso: string) => timeFmt.format(new Date(iso));

/** "Wednesday night training" */
export function sessionTitle(startedAt: string): string {
  const d = new Date(startedAt);
  const h = d.getHours();
  const part = h < 12 ? "morning" : h < 17 ? "afternoon" : h < 21 ? "evening" : "night";
  return `${dayFmt.format(d)} ${part} training`;
}

/** In-game player colours (aoe2companion color ids 1-8). */
const PLAYER_COLORS: Record<number, string> = {
  1: "#405bff",
  2: "#ff0000",
  3: "#00ff00",
  4: "#ffff00",
  5: "#00ffff",
  6: "#ff57b3",
  7: "#9a9a9a",
  8: "#ff9600",
};
export const playerColor = (color: number | null | undefined) => PLAYER_COLORS[color ?? 0] ?? "#8a8174";

export const pct =(part: number, total: number) => (total ? `${Math.round((100 * part) / total)}%` : "–");
