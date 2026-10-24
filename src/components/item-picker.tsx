"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Search, Plus } from "@/components/hand-icons";
import clsx from "clsx";
import { api } from "@/lib/client";
import { formatQty, type StockStatus } from "@/lib/format";
import { StatusBadge, Spinner, buttonClass } from "./ui/primitives";
import { ClearSearchButton, RecentSearchList, useRecentSearches } from "./recent-searches";

export type PickerItem = {
  id: string;
  name: string;
  sku: string;
  category_name: string | null;
  unit_symbol: string;
  quantity: string;
  status: StockStatus;
};

/** Search-as-you-type item finder. Makes it obvious which item is being selected. */
export function ItemPicker({
  onSelect, autoFocus, addNewHref, placeholder = "Search by item name or code",
}: {
  onSelect: (item: PickerItem) => void;
  autoFocus?: boolean;
  addNewHref?: (q: string) => string;
  placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PickerItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);
  const box = useRef<HTMLInputElement>(null);
  const recent = useRecentSearches("item-picker");
  const pick = (it: PickerItem) => { recent.add(q.trim() || it.name); onSelect(it); };

  useEffect(() => {
    const id = ++reqId.current;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const data = await api<{ rows: PickerItem[] }>(`/api/items?q=${encodeURIComponent(q)}&pageSize=8&sort=name`);
        if (id === reqId.current) {
          setResults(data.rows);
          setActive(0);
          setError(null);
        }
      } catch (e) {
        if (id === reqId.current) setError((e as Error).message);
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    }, q ? 180 : 0);
    return () => clearTimeout(t);
  }, [q]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    if (e.key === "Enter" && !loading && results[active]) { e.preventDefault(); pick(results[active]); }
    if (e.key === "Escape" && q) { e.preventDefault(); setQ(""); }
  };

  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-burgundy/70" aria-hidden />
        <input
          ref={box}
          autoFocus={autoFocus}
          autoComplete="off"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKey}
          placeholder={placeholder}
          aria-label="Search items"
          role="combobox"
          aria-expanded="true"
          aria-controls="item-picker-list"
          className="h-12 w-full rounded-2xl border border-burgundy/15 bg-paper pl-11 pr-24 text-[15px] shadow-[0_6px_18px_-14px_rgb(0_0_0/0.6)] placeholder:text-burgundy/40 transition focus:border-burgundy/50 focus:bg-paper focus:outline-none focus:ring-4 focus:ring-burgundy/10"
        />
        {loading && <Spinner className={`absolute top-1/2 size-5 -translate-y-1/2 ${q ? "right-[5.5rem]" : "right-3"}`} />}
        {q && <ClearSearchButton onClear={() => { setQ(""); box.current?.focus(); }} />}
      </div>
      {error && <p className="mt-2 text-sm text-bad">{error}</p>}
      {!q && (
        <RecentSearchList list={recent.list} onPick={(t) => { setQ(t); box.current?.focus(); }} onRemove={recent.remove} onClearAll={recent.clear} className="mt-2" />
      )}
      <ul id="item-picker-list" role="listbox" className="mt-2 max-h-[22rem] space-y-1 overflow-y-auto rounded-2xl bg-paper p-1.5 shadow-[0_14px_30px_-20px_rgb(0_0_0/0.6)] ring-1 ring-burgundy/15">
        {results.map((it, i) => (
          <li key={it.id} role="option" aria-selected={i === active}>
            <button
              type="button"
              onClick={() => pick(it)}
              onMouseEnter={() => setActive(i)}
              className={clsx("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors", i === active ? "bg-burgundy text-paper" : "hover:bg-burgundy/5")}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold tracking-[-0.01em]">{it.name}</p>
                <p className={clsx("truncate text-[11px] font-medium uppercase tracking-[0.12em]", i === active ? "text-paper/75" : "text-burgundy/55")}>
                  {it.sku}
                  {it.category_name ? ` · ${it.category_name}` : ""}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-base font-semibold tabular-nums">
                  {formatQty(it.quantity)} <span className={clsx("text-sm font-medium", i === active ? "text-paper/75" : "text-burgundy/55")}>{it.unit_symbol}</span>
                </p>
                {it.status !== "in_stock" && <StatusBadge status={it.status} />}
              </div>
            </button>
          </li>
        ))}
        {!loading && !results.length && (
          <li className="px-4 py-6 text-center text-sm text-muted">
            {q ? <>No item matches “{q}”.</> : "No items yet."}
            {addNewHref && (
              <div className="mt-3">
                <Link href={addNewHref(q)} className={buttonClass("secondary", "sm")}>
                  <Plus className="size-4" /> Add {q ? `“${q}”` : "a new item"}
                </Link>
              </div>
            )}
          </li>
        )}
      </ul>
    </div>
  );
}
