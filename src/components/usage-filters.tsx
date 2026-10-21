"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import clsx from "clsx";
import { Select } from "./ui/primitives";

type Opt = { value: string; label: string };

const RANGES = [
  { v: "7", l: "7 days" },
  { v: "30", l: "30 days" },
  { v: "90", l: "90 days" },
  { v: "month", l: "This month" },
  { v: "12w", l: "12 weeks" },
  { v: "12m", l: "12 months" },
  { v: "custom", l: "Dates" },
];

export function UsageFilters({ tab, workers, items, categories, users }: { tab: string; workers: Opt[]; items: Opt[]; categories: Opt[]; users: Opt[] }) {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const range = sp.get("range") ?? "30";
  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) { if (v) next.set(k, v); else next.delete(k); }
    next.delete("page");
    router.replace(`${pathname}?${next}`, { scroll: false });
  };
  return (
    <div className="glass mb-4 rounded-[var(--radius-card)] p-3 sm:p-4">
      <div className="flex flex-wrap gap-1.5">
        {RANGES.map((r) => (
          <button key={r.v} type="button" onClick={() => set({ range: r.v === "30" ? null : r.v })}
            className={clsx("h-9 rounded-xl px-4 text-sm font-semibold", range === r.v ? "bg-burgundy text-paper" : "bg-paper text-burgundy ring-1 ring-burgundy/15 hover:bg-burgundy/5")}>
            {r.l}
          </button>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
        {range === "custom" && (
          <>
            <input type="date" aria-label="From" value={sp.get("from") ?? ""} onChange={(e) => set({ from: e.target.value })} className="h-11 rounded-2xl bg-paper px-4 text-sm ring-1 ring-burgundy/15" />
            <input type="date" aria-label="To" value={sp.get("to") ?? ""} onChange={(e) => set({ to: e.target.value })} className="h-11 rounded-2xl bg-paper px-4 text-sm ring-1 ring-burgundy/15" />
          </>
        )}
        {tab === "usage" ? (
          <>
            <Select aria-label="Worker" value={sp.get("worker") ?? ""} onChange={(e) => set({ worker: e.target.value })} className="rounded-2xl">
              <option value="">All workers</option>
              {workers.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
            <Select aria-label="Category" value={sp.get("category") ?? ""} onChange={(e) => set({ category: e.target.value })} className="rounded-2xl">
              <option value="">All categories</option>
              {categories.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
            <Select aria-label="Item" value={sp.get("item") ?? ""} onChange={(e) => set({ item: e.target.value })} className="col-span-2 rounded-2xl lg:col-span-1">
              <option value="">All items</option>
              {items.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </>
        ) : (
          <>
            <Select aria-label="User" value={sp.get("user") ?? ""} onChange={(e) => set({ user: e.target.value })} className="rounded-2xl">
              <option value="">Everyone</option>
              {users.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
            <Select aria-label="Area" value={sp.get("area") ?? ""} onChange={(e) => set({ area: e.target.value })} className="rounded-2xl">
              <option value="">Everything</option>
              <option value="item">Items</option>
              <option value="stock_transaction">Corrections</option>
              <option value="user">Users & permissions</option>
              <option value="worker">Workers</option>
              <option value="category">Categories</option>
              <option value="supplier">Suppliers</option>
              <option value="settings">Settings</option>
              <option value="stock_count">Stock counts</option>
            </Select>
          </>
        )}
      </div>
    </div>
  );
}
