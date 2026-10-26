import { useCallback, useSyncExternalStore } from "react";

/** In-game clock (what players quote: "feudal at 9:40") vs. wall-clock time. */
export type TimeMode = "game" | "real";

const KEY = "timeMode";
const listeners = new Set<() => void>();

function read(): TimeMode {
  try {
    return localStorage.getItem(KEY) === "real" ? "real" : "game";
  } catch {
    return "game";
  }
}

export function useTimeMode() {
  const mode = useSyncExternalStore(
    (cb) => (listeners.add(cb), () => listeners.delete(cb)),
    read,
    () => "game" as TimeMode,
  );
  const setMode = useCallback((m: TimeMode) => {
    try {
      localStorage.setItem(KEY, m);
    } catch {
      /* private mode: setting just won't persist */
    }
    listeners.forEach((l) => l());
  }, []);
  /** Convert a replay (game-time) duration for display. */
  const convert = useCallback(
    (gameSeconds: number | null | undefined, speedFactor: number | null | undefined = 1.7) =>
      gameSeconds == null ? null : mode === "real" ? gameSeconds / (speedFactor || 1.7) : gameSeconds,
    [mode],
  );
  return { mode, setMode, convert };
}
