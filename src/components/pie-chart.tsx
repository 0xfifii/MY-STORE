"use client";

import Link from "next/link";
import { useState } from "react";

// Categorical slots (validated for colour-blind separation); "Other" is neutral grey.
const COLORS = ["#9c2a45", "#2a78d6", "#eda100", "#1baf7a", "#6250d6"];
const OTHER = "#a69c9e";

export type Slice = { label: string; value: number; detail: string; href?: string };

/** Donut chart: share of the total with a hover readout and a labelled legend (never colour alone). */
export function PieChart({ slices, centerLabel, centerValue, size = 200, emptyText }: {
  slices: Slice[]; centerLabel: string; centerValue: string; size?: number; emptyText: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const total = slices.reduce((a, s) => a + s.value, 0);
  if (!slices.length || total <= 0) {
    return <p className="py-10 text-center text-sm text-muted">{emptyText}</p>;
  }
  const r = 42;
  const stroke = 16;
  const C = 2 * Math.PI * r;
  const gap = slices.length > 1 ? 1.2 : 0; // surface gap between slices
  let offset = 0;
  const color = (i: number, s: Slice) => (s.label.startsWith("Other items") ? OTHER : COLORS[i % COLORS.length]);
  const active = hover !== null ? slices[hover] : null;

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg viewBox="0 0 100 100" className="size-full -rotate-90" role="img" aria-label={`${centerLabel}: ${slices.map((s) => `${s.label} ${Math.round((s.value / total) * 100)}%`).join(", ")}`}>
          <circle cx="50" cy="50" r={r} fill="none" stroke="rgb(255 255 255 / 0.7)" strokeWidth={stroke} />
          {slices.map((s, i) => {
            const len = (s.value / total) * C;
            const dash = Math.max(len - gap, 0.01);
            const el = (
              <circle key={s.label} cx="50" cy="50" r={r} fill="none" stroke={color(i, s)} strokeWidth={hover === i ? stroke + 3 : stroke}
                strokeDasharray={`${dash} ${C - dash}`} strokeDashoffset={-offset}
                onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}
                tabIndex={0} className="cursor-pointer outline-none transition-[stroke-width]">
                <title>{`${s.label}: ${s.detail} (${Math.round((s.value / total) * 100)}%)`}</title>
              </circle>
            );
            offset += len;
            return el;
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
          <span className="text-[11px] leading-tight text-muted">{active ? active.label : centerLabel}</span>
          <span className="mt-0.5 text-lg font-semibold leading-tight">
            {active ? `${Math.round((active.value / total) * 100)}%` : centerValue}
          </span>
        </div>
      </div>
      <ul className="w-full min-w-0 space-y-1.5">
        {slices.map((s, i) => {
          const pct = Math.round((s.value / total) * 100);
          const body = (
            <>
              <span className="mt-1 size-2.5 shrink-0 rounded-full" style={{ background: color(i, s) }} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{s.label}</span>
                <span className="block truncate text-xs text-muted">{s.detail}</span>
              </span>
              <span className="text-sm font-semibold tabular-nums">{pct}%</span>
            </>
          );
          return (
            <li key={s.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
              className={`rounded-2xl px-2.5 py-1.5 transition-colors ${hover === i ? "bg-white" : ""}`}>
              {s.href ? <Link href={s.href} className="flex items-start gap-2.5">{body}</Link> : <div className="flex items-start gap-2.5">{body}</div>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
