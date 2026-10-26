import { useEffect, useMemo, useRef, useState } from "react";
import type { GameMap as MapData } from "../api/client";

export type Marker = { profileId: number; color: string; dim?: boolean };

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

/** Diamond minimap (like in-game) with a command-density heatmap and start-position markers. */
export function HeatMinimap({
  data,
  points,
  markers,
  maxSize = 640,
  markerRadius = 6,
}: {
  data: MapData;
  points: [number, number][];
  markers: Marker[];
  maxSize?: number;
  markerRadius?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(Math.min(320, maxSize));

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize(Math.min(maxSize, Math.floor(e.contentRect.width))));
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
    for (const m of markers) {
      const s = data.starts[m.profileId];
      if (!s) continue;
      const [sx, sy] = toScreen(s[0], s[1]);
      ctx.beginPath();
      ctx.arc(sx, sy, m.dim ? markerRadius * 0.66 : markerRadius, 0, Math.PI * 2);
      ctx.fillStyle = m.color;
      ctx.globalAlpha = m.dim ? 0.4 : 1;
      ctx.fill();
      ctx.lineWidth = Math.max(1, markerRadius / 3);
      ctx.strokeStyle = "rgba(0,0,0,0.7)";
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }, [size, terrain, heat, data, markers, markerRadius]);

  return (
    <div ref={wrap} className="w-full min-w-0">
      <canvas
        ref={ref}
        style={{ width: size, height: size }}
        className="mx-auto block"
        role="img"
        aria-label="Map heatmap of player commands"
      />
    </div>
  );
}
