"use client";

import { useEffect, useRef, useState } from "react";

export type LinePoint = { x: string; y: number | null; note?: string };
export type LineSeries = { name: string; color: string; points: LinePoint[] };

const fmtMoney = (v: number, sym: string) => `${sym}${v.toLocaleString("en-US", { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
const fmtQty = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 3 });

/**
 * Responsive SVG line chart with a hover/tap crosshair and readout. Points with y = null leave a gap.
 * Price changes between consecutive points are marked: red dot = went up, green dot = went down (when markChanges).
 */
export function LineChart({ series, format, symbol = "", unit = "", height = 240, markChanges, emptyText = "No data for this period.", zeroBase = true }: {
  series: LineSeries[]; format: "money" | "qty"; symbol?: string; unit?: string; height?: number; markChanges?: boolean; emptyText?: string;
  /** false = zoom the axis to the data (prices), true = start at zero (balances, totals). */
  zeroBase?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(640);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const labels = series[0]?.points.map((p) => p.x) ?? [];
  const values = series.flatMap((s) => s.points.map((p) => p.y)).filter((v): v is number => v !== null);
  if (!labels.length || !values.length) return <p className="py-10 text-center text-sm text-muted">{emptyText}</p>;

  const f = (v: number) => (format === "money" ? fmtMoney(v, symbol) : `${fmtQty(v)}${unit ? ` ${unit}` : ""}`);
  const padL = 64, padR = 14, padT = 14, padB = 30;
  // "Nice" axis: steps of 1, 2, 2.5 or 5 × 10^n, starting at 0 when all values are positive.
  const vmin = Math.min(...values), vmax = Math.max(...values);
  const base = zeroBase && vmin >= 0 ? 0 : vmin;
  const rawStep = ((vmax - base) || Math.abs(vmax) * 0.2 || 1) / 4;
  const mag = 10 ** Math.floor(Math.log10(rawStep));
  const stepY = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((k) => k >= rawStep)!;
  let lo = Math.floor(base / stepY) * stepY;
  if (!zeroBase && lo === vmin) lo -= stepY;
  if (zeroBase && vmin >= 0) lo = Math.max(0, lo);
  let hi = Math.ceil(vmax / stepY) * stepY;
  if (hi === vmax) hi += zeroBase ? 0 : stepY;
  if (hi <= lo) hi = lo + stepY;
  const iw = w - padL - padR, ih = height - padT - padB;
  const X = (i: number) => padL + (labels.length === 1 ? iw / 2 : (i / (labels.length - 1)) * iw);
  const Y = (v: number) => padT + ih - ((v - lo) / (hi - lo)) * ih;
  const ticks: number[] = [];
  for (let t = lo; t <= hi + stepY / 1000; t += stepY) ticks.push(Math.round(t * 1e6) / 1e6);
  const step = Math.max(1, Math.ceil(labels.length / Math.max(2, Math.floor(iw / 70))));

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left;
    let best = 0, d = Infinity;
    labels.forEach((_, i) => { const dd = Math.abs(X(i) - x); if (dd < d) { d = dd; best = i; } });
    setHover(best);
  };

  return (
    <div ref={ref} className="relative w-full min-w-0 select-none">
      <svg viewBox={`0 0 ${w} ${height}`} width="100%" height={height} preserveAspectRatio="none" onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)} role="img"
        aria-label={series.map((s) => `${s.name}: ${s.points.filter((p) => p.y !== null).map((p) => `${p.x} ${f(p.y!)}`).join(", ")}`).join("; ")} className="block touch-pan-y overflow-visible">
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={padL} x2={w - padR} y1={Y(t)} y2={Y(t)} stroke="#ecdfe2" strokeDasharray={i === 0 ? "" : "3 4"} />
            <text x={padL - 8} y={Y(t) + 4} textAnchor="end" fontSize="11" fill="#77696d">{format === "money" ? fmtMoney(t >= 100 ? Math.round(t) : t, symbol) : fmtQty(t)}</text>
          </g>
        ))}
        {labels.map((l, i) => (i % step === 0 || i === labels.length - 1) && (
          <text key={i} x={X(i)} y={height - 8} textAnchor={i === 0 ? "start" : i === labels.length - 1 ? "end" : "middle"} fontSize="11" fill="#77696d">{l}</text>
        ))}
        {hover !== null && <line x1={X(hover)} x2={X(hover)} y1={padT} y2={padT + ih} stroke="#1d1517" strokeOpacity="0.25" />}
        {series.map((s) => {
          let d = "", pen = false;
          s.points.forEach((p, i) => {
            if (p.y === null) { pen = false; return; }
            d += `${pen ? "L" : "M"}${X(i).toFixed(1)},${Y(p.y).toFixed(1)}`;
            pen = true;
          });
          return (
            <g key={s.name}>
              <path d={d} fill="none" stroke={s.color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
              {s.points.map((p, i) => {
                if (p.y === null) return null;
                const prevY = s.points.slice(0, i).reverse().find((q) => q.y !== null)?.y ?? null;
                const mark = markChanges && prevY !== null && p.y !== prevY ? (p.y > prevY ? "#b42318" : "#1baf7a") : s.color;
                const r = hover === i ? 6 : labels.length > 40 ? 0 : 3.5;
                return r ? <circle key={i} cx={X(i)} cy={Y(p.y)} r={r} fill="#fff" stroke={mark} strokeWidth={markChanges && mark !== s.color ? 3 : 2} /> : null;
              })}
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div className="pointer-events-none absolute top-1 z-10 min-w-36 rounded-2xl bg-night px-3 py-2 text-xs text-white shadow-lg"
          style={{ left: Math.min(Math.max(X(hover) - 72, 0), w - 160) }}>
          <p className="font-semibold">{labels[hover]}</p>
          {series.map((s) => {
            const p = s.points[hover];
            return (
              <p key={s.name} className="mt-0.5 flex items-center gap-1.5">
                <span className="size-2 rounded-full" style={{ background: s.color }} />
                {s.name}: <strong>{p?.y === null || p?.y === undefined ? "—" : f(p.y)}</strong>
                {p?.note ? <span className="text-white/70">· {p.note}</span> : null}
              </p>
            );
          })}
        </div>
      )}
      {series.length > 1 && (
        <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted">
          {series.map((s) => <span key={s.name} className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ background: s.color }} />{s.name}</span>)}
        </div>
      )}
    </div>
  );
}
