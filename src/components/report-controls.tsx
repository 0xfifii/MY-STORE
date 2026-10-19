"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import clsx from "clsx";
import { Download, FileText, Save, Sheet, FileSpreadsheet } from "lucide-react";
import { Button, Select } from "./ui/primitives";
import { useToast } from "./ui/toast";
import { useApp } from "./app-context";
import { api } from "@/lib/client";

const PRESETS = [
  { v: "today", l: "Today" },
  { v: "yesterday", l: "Yesterday" },
  { v: "week", l: "Weekly" },
  { v: "month", l: "Monthly" },
  { v: "custom", l: "Date range" },
];
const KINDS = [
  { v: "full", l: "Full report" },
  { v: "stock_in", l: "Stock in only" },
  { v: "stock_out", l: "Stock out only" },
  { v: "balance", l: "Inventory balance" },
];

export function ReportControls({
  categories, items, resolved,
}: {
  categories: { id: number; name: string }[];
  items: { id: string; name: string; sku: string }[];
  resolved: { from: string; to: string; kind: string; item: string | null; category: string | null };
}) {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const app = useApp();
  const preset = sp.get("preset") ?? (sp.get("from") ? "custom" : "today");
  const [saving, setSaving] = useState(false);

  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) { if (v) next.set(k, v); else next.delete(k); }
    router.replace(`${pathname}?${next}`, { scroll: false });
  };

  const choosePreset = (v: string) => {
    if (v === "custom") update({ preset: null, from: resolved.from, to: resolved.to, month: null });
    else if (v === "month") update({ preset: "month", month: resolved.from.slice(0, 7), from: null, to: null, week: null });
    else if (v === "week") update({ preset: "week", week: resolved.from, from: null, to: null, month: null });
    else update({ preset: v, from: null, to: null, month: null });
  };

  const periodType = preset === "week" ? "week" : preset === "month" ? "month" : null;
  const exportQuery = new URLSearchParams({
    from: resolved.from, to: resolved.to, kind: resolved.kind,
    ...(periodType ? { period_type: periodType } : {}),
    ...(resolved.item ? { item: resolved.item } : {}), ...(resolved.category ? { category: resolved.category } : {}),
  });

  const save = async () => {
    setSaving(true);
    try {
      await api("/api/reports/generate", {
        method: "POST",
        json: { from: resolved.from, to: resolved.to, kind: resolved.kind, item: resolved.item, category: resolved.category, period_type: periodType, formats: ["pdf", "xlsx", "csv"] },
      });
      toast.success("Report saved", "PDF, Excel and CSV copies are in Report History.");
      router.refresh();
    } catch (e) {
      toast.error("Couldn't generate the report", (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="glass rounded-[var(--radius-card)] p-4 sm:p-5">
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Period">
        {PRESETS.map((p) => (
          <button key={p.v} role="tab" aria-selected={preset === p.v} onClick={() => choosePreset(p.v)}
            className={clsx("h-9 rounded-full px-4 text-sm font-semibold", preset === p.v ? "bg-burgundy text-white" : "bg-canvas text-ink ring-1 ring-line hover:bg-rose")}>
            {p.l}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {preset === "week" && (
          <label className="text-sm">
            <span className="mb-1 block font-medium">Week containing</span>
            <input type="date" value={sp.get("week") ?? resolved.from} onChange={(e) => update({ week: e.target.value })}
              className="h-11 w-full rounded-full border border-white bg-white/70 px-3" />
            <span className="mt-1 block text-xs text-muted">Monday to Sunday</span>
          </label>
        )}
        {preset === "month" && (
          <label className="text-sm">
            <span className="mb-1 block font-medium">Month</span>
            <input type="month" value={sp.get("month") ?? resolved.from.slice(0, 7)} onChange={(e) => update({ month: e.target.value })}
              className="h-11 w-full rounded-full border border-white bg-white/70 px-3" />
          </label>
        )}
        {preset === "custom" && (
          <>
            <label className="text-sm">
              <span className="mb-1 block font-medium">From</span>
              <input type="date" value={sp.get("from") ?? resolved.from} onChange={(e) => update({ from: e.target.value })} className="h-11 w-full rounded-full border border-white bg-white/70 px-3" />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">To</span>
              <input type="date" value={sp.get("to") ?? resolved.to} onChange={(e) => update({ to: e.target.value })} className="h-11 w-full rounded-full border border-white bg-white/70 px-3" />
            </label>
          </>
        )}
        <label className="text-sm">
          <span className="mb-1 block font-medium">Report</span>
          <Select value={resolved.kind} onChange={(e) => update({ kind: e.target.value })}>
            {KINDS.map((k) => <option key={k.v} value={k.v}>{k.l}</option>)}
          </Select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Category</span>
          <Select value={resolved.category ?? ""} onChange={(e) => update({ category: e.target.value || null, item: null })}>
            <option value="">All categories</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Item</span>
          <Select value={resolved.item ?? ""} onChange={(e) => update({ item: e.target.value || null, category: null })}>
            <option value="">All items</option>
            {items.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.sku})</option>)}
          </Select>
        </label>
      </div>

      <div className="mt-5 flex flex-col gap-2 border-t border-white/80 pt-4 sm:flex-row sm:flex-wrap sm:items-center">
        <span className="flex items-center gap-1.5 text-sm font-medium text-muted"><Download className="size-4" /> Download</span>
        <a href={`/api/reports/export?${exportQuery}&format=pdf`} className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl bg-burgundy px-4 text-sm font-semibold text-white hover:bg-burgundy-hover">
          <FileText className="size-4" /> PDF
        </a>
        <a href={`/api/reports/export?${exportQuery}&format=xlsx`} className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-white/80 px-5 text-sm font-semibold shadow-sm ring-1 ring-white hover:bg-white">
          <FileSpreadsheet className="size-4" /> Excel (.xlsx)
        </a>
        <a href={`/api/reports/export?${exportQuery}&format=csv`} className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-white/80 px-5 text-sm font-semibold shadow-sm ring-1 ring-white hover:bg-white">
          <Sheet className="size-4" /> CSV
        </a>
        {app.can("report.generate") && (
          <Button variant="ghost" onClick={save} loading={saving} className="sm:ml-auto">
            <Save className="size-4" /> Save to Report History
          </Button>
        )}
      </div>
    </div>
  );
}
