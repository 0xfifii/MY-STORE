"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { api } from "@/lib/client";
import { formatMoney, formatQty } from "@/lib/format";
import { useApp } from "./app-context";
import { Spinner } from "./ui/primitives";

type Line = {
  transfer_no: string; occurred_at: string; direction: "sent" | "received"; other: string; by: string | null; notes: string | null;
  name: string; sku: string; quantity: string; unit_symbol: string; total_value: string;
};
type Item = { name: string; sku: string; unit_symbol: string; sent_qty: number; sent_value: number; received_qty: number; received_value: number };
type Report = {
  periodLabel: string; storeName: string; lines: Line[]; items: Item[]; partners: string[];
  totals: { transfers: number; sent_value: number; received_value: number };
};

const PRESETS = [
  { v: "today", label: "Today" }, { v: "yesterday", label: "Yesterday" }, { v: "week", label: "Last 7 days" },
  { v: "month", label: "This month" }, { v: "last_month", label: "Last month" }, { v: "custom", label: "Pick dates" },
];
const DIRS = [{ v: "all", label: "Sent and received" }, { v: "sent", label: "Sent" }, { v: "received", label: "Received" }];

/**
 * Transfer report for the account you're in: what it sent to the other account(s) and what it received,
 * for a period. Shows on screen and downloads as PDF (with the logo), Excel or CSV.
 */
export function TransferReport({ refreshKey = 0 }: { refreshKey?: number }) {
  const app = useApp();
  const sym = app.currencySymbol;
  const [preset, setPreset] = useState("month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [dir, setDir] = useState("all");
  const [data, setData] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const qs = useMemo(() => {
    const p = new URLSearchParams({ direction: dir });
    if (preset === "custom") { if (from) p.set("from", from); if (to) p.set("to", to || from); }
    else p.set("preset", preset);
    return p.toString();
  }, [preset, from, to, dir]);

  useEffect(() => {
    if (preset === "custom" && !from) return;
    let live = true;
    setLoading(true);
    api<{ report: Report }>(`/api/transfers/report?${qs}`)
      .then((d) => { if (live) { setData(d.report); setError(null); } })
      .catch((e) => live && setError((e as Error).message))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [qs, preset, from, refreshKey]);

  const chip = (on: boolean) => clsx("shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition",
    on ? "bg-burgundy text-white" : "bg-black/[0.05] text-ink/70 hover:text-ink");
  const m = (v: number | string) => formatMoney(v, sym);
  const showSent = dir !== "received";
  const showRec = dir !== "sent";

  return (
    <div data-testid="transfer-report">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Period">
        {PRESETS.map((p) => <button key={p.v} type="button" className={chip(preset === p.v)} onClick={() => setPreset(p.v)}>{p.label}</button>)}
      </div>
      {preset === "custom" && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <label className="flex items-center gap-2">From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-10 rounded-xl bg-paper px-3 ring-1 ring-black/10" /></label>
          <label className="flex items-center gap-2">to <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="h-10 rounded-xl bg-paper px-3 ring-1 ring-black/10" /></label>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Direction">
        {DIRS.map((d) => <button key={d.v} type="button" className={chip(dir === d.v)} onClick={() => setDir(d.v)}>{d.label}</button>)}
      </div>

      {error && <p className="mt-4 rounded-2xl bg-bad-bg px-3 py-2 text-sm text-bad">{error}</p>}
      {!data && loading && <div className="flex justify-center py-8"><Spinner className="size-6" /></div>}

      {data && (
        <div className={clsx("mt-4 transition-opacity", loading && "opacity-60")}>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="font-semibold">{data.periodLabel}</p>
              <p className="text-xs text-muted">{data.partners.length ? `With ${data.partners.join(", ")}` : "No transfers in this period"}</p>
            </div>
            <div className="flex gap-1.5">
              {(["pdf", "xlsx", "csv"] as const).map((f) => (
                <a key={f} href={`/api/transfers/report?${qs}&format=${f}`} data-testid={`transfer-report-${f}`}
                  className={clsx("rounded-full px-3.5 py-1.5 text-[13px] font-semibold", f === "pdf" ? "bg-burgundy text-white" : "bg-black/[0.05] text-ink hover:bg-black/[0.08]")}>
                  {f === "pdf" ? "PDF" : f === "xlsx" ? "Excel" : "CSV"}
                </a>
              ))}
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat label="Transfers" value={String(data.totals.transfers)} />
            {showSent && <Stat label="Value sent" value={m(data.totals.sent_value)} strong={dir === "sent"} />}
            {showRec && <Stat label="Value received" value={m(data.totals.received_value)} strong={dir === "received"} />}
          </div>

          {data.items.length > 0 && (
            <div className="mt-4 overflow-x-auto rounded-2xl ring-1 ring-black/5">
              <table className="w-full min-w-[420px] text-sm">
                <thead className="bg-black/[0.03] text-left text-xs text-muted">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Item</th>
                    {showSent && <th className="px-3 py-2 text-right font-semibold">Sent</th>}
                    {showRec && <th className="px-3 py-2 text-right font-semibold">Received</th>}
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((it) => (
                    <tr key={`${it.name}|${it.unit_symbol}`} className="border-t border-black/5">
                      <td className="px-3 py-2 font-medium">{it.name}</td>
                      {showSent && <td className="px-3 py-2 text-right tabular-nums">{it.sent_qty ? <>{formatQty(it.sent_qty)} {it.unit_symbol}<span className="block text-xs text-muted">{m(it.sent_value)}</span></> : "-"}</td>}
                      {showRec && <td className="px-3 py-2 text-right tabular-nums">{it.received_qty ? <>{formatQty(it.received_qty)} {it.unit_symbol}<span className="block text-xs text-muted">{m(it.received_value)}</span></> : "-"}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data.lines.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-semibold text-burgundy">Every transfer ({data.lines.length} lines)</summary>
              <ul className="mt-2 divide-y divide-black/5 text-sm">
                {data.lines.map((l, i) => (
                  <li key={`${l.transfer_no}-${i}`} className="flex items-start justify-between gap-3 py-2">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{l.name} × {formatQty(l.quantity)} {l.unit_symbol}</span>
                      <span className="block text-xs text-muted">
                        {l.direction === "sent" ? `Sent to ${l.other}` : `From ${l.other}`} · {l.transfer_no} ·{" "}
                        {new Date(l.occurred_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                        {l.by ? ` · ${l.by}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 tabular-nums">{m(l.total_value)}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={clsx("rounded-2xl px-3 py-2.5", strong ? "bg-burgundy text-white" : "bg-black/[0.04]")}>
      <p className={clsx("text-[10px] font-semibold uppercase tracking-[0.12em]", strong ? "text-white/75" : "text-muted")}>{label}</p>
      <p className="mt-0.5 text-lg font-bold tabular-nums">{value}</p>
    </div>
  );
}
