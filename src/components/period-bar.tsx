"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import clsx from "clsx";

const KINDS = [["day", "Day"], ["week", "Week"], ["month", "Month"], ["year", "Year"], ["custom", "Dates"]] as const;

/** Day / Week / Month / Year / custom dates, with previous / next period buttons. */
export function PeriodBar({ kind, label, prev, next, from, to }: { kind: string; label: string; prev: string | null; next: string | null; from: string; to: string }) {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const go = (patch: Record<string, string | null>) => {
    const n = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) { if (v) n.set(k, v); else n.delete(k); }
    router.replace(`${pathname}?${n}`, { scroll: false });
  };
  return (
    <div className="glass flex flex-col gap-3 rounded-[var(--radius-card)] p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
      <div className="flex gap-1 overflow-x-auto rounded-full bg-white/60 p-1 ring-1 ring-white" role="tablist" aria-label="Period">
        {KINDS.map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={kind === k} onClick={() => go({ p: k === "month" ? null : k, d: null, ...(k === "custom" ? { from, to } : { from: null, to: null }) })}
            className={clsx("shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold transition-all duration-200 active:scale-95",
              kind === k ? "bg-night text-white shadow-sm" : "text-muted hover:bg-white hover:text-ink")}>
            {l}
          </button>
        ))}
      </div>
      {kind === "custom" ? (
        <div className="flex items-center gap-2 text-sm">
          <input type="date" aria-label="From" value={from} onChange={(e) => e.target.value && go({ from: e.target.value })} className="h-10 min-w-0 flex-1 rounded-xl bg-paper px-3 ring-1 ring-burgundy/15" />
          <span className="text-muted">to</span>
          <input type="date" aria-label="To" value={to} onChange={(e) => e.target.value && go({ to: e.target.value })} className="h-10 min-w-0 flex-1 rounded-xl bg-paper px-3 ring-1 ring-burgundy/15" />
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <button type="button" disabled={!prev} onClick={() => prev && go({ d: prev })} aria-label="Previous period"
            className="h-10 rounded-full bg-white/80 px-4 text-sm font-semibold ring-1 ring-white transition hover:bg-white hover:text-burgundy active:scale-95 disabled:opacity-30">
            Previous
          </button>
          <p className="min-w-40 text-center text-sm font-semibold" data-testid="period-label">{label}</p>
          <button type="button" disabled={!next} onClick={() => next && go({ d: next })} aria-label="Next period"
            className="h-10 rounded-full bg-white/80 px-4 text-sm font-semibold ring-1 ring-white transition hover:bg-white hover:text-burgundy active:scale-95 disabled:opacity-30">
            Next
          </button>
        </div>
      )}
    </div>
  );
}
