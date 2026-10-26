import { BarChart, LineChart } from "echarts/charts";
import {
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TooltipComponent,
} from "echarts/components";
import * as echarts from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { useEffect, useRef, useSyncExternalStore } from "react";

echarts.use([
  BarChart,
  LineChart,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TooltipComponent,
  CanvasRenderer,
]);

/** Shared pieces so all charts look alike. Colors are CSS vars, resolved per theme by <Chart>. */
export const axisStyle = {
  axisLine: { lineStyle: { color: "var(--color-line)" } },
  axisLabel: { color: "var(--color-muted)" },
  splitLine: { lineStyle: { color: "var(--color-grid)" } },
};
export const tooltipStyle = {
  backgroundColor: "var(--color-surface)",
  borderColor: "var(--color-line)",
  textStyle: { color: "var(--color-ink)" },
};

export type ChartOption = echarts.EChartsCoreOption;

const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");

/** Re-renders when the OS switches between light and dark. */
export function useColorScheme(): "light" | "dark" {
  return useSyncExternalStore(
    (cb) => {
      darkQuery.addEventListener("change", cb);
      return () => darkQuery.removeEventListener("change", cb);
    },
    () => (darkQuery.matches ? "dark" : "light"),
  );
}

const VAR_RE = /^var\((--[\w-]+)\)$/;

/** Canvas can't read CSS vars, so swap `"var(--x)"` strings for their current values. */
function resolveVars<T>(value: T, styles: CSSStyleDeclaration): T {
  if (typeof value === "string") {
    const m = VAR_RE.exec(value);
    return (m ? styles.getPropertyValue(m[1]).trim() || value : value) as T;
  }
  if (Array.isArray(value)) return value.map((v) => resolveVars(v, styles)) as T;
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolveVars(v, styles)])) as T;
  }
  return value;
}

export function Chart({ option, className }: { option: ChartOption; className?: string }) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!el.current) return;
    const c = echarts.init(el.current, undefined, { renderer: "canvas" });
    chart.current = c;
    const ro = new ResizeObserver(() => c.resize());
    ro.observe(el.current);
    return () => {
      ro.disconnect();
      c.dispose();
      chart.current = null;
    };
  }, []);

  const scheme = useColorScheme();
  useEffect(() => {
    chart.current?.setOption(resolveVars(option, getComputedStyle(document.documentElement)), { notMerge: true });
  }, [option, scheme]);

  return <div ref={el} className={className} />;
}
