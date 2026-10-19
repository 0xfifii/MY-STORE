"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Search, Plus } from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/client";
import { formatQty, type StockStatus } from "@/lib/format";
import { StatusBadge, Spinner, buttonClass } from "./ui/primitives";

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
    if (e.key === "Enter" && !loading && results[active]) { e.preventDefault(); onSelect(results[active]); }
  };

  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted" aria-hidden />
        <input
          autoFocus={autoFocus}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKey}
          placeholder={placeholder}
          aria-label="Search items"
          role="combobox"
          aria-expanded="true"
          aria-controls="item-picker-list"
          className="h-12 w-full rounded-full border border-white bg-white/70 bg-white pl-10 pr-10 text-base focus:border-burgundy focus:outline-none focus:ring-2 focus:ring-burgundy/15"
        />
        {loading && <Spinner className="absolute right-3 top-1/2 size-5 -translate-y-1/2" />}
      </div>
      {error && <p className="mt-2 text-sm text-bad">{error}</p>}
      <ul id="item-picker-list" role="listbox" className="mt-2 divide-y divide-white/80 overflow-hidden rounded-full border border-white bg-white/70 bg-white">
        {results.map((it, i) => (
          <li key={it.id} role="option" aria-selected={i === active}>
            <button
              type="button"
              onClick={() => onSelect(it)}
              onMouseEnter={() => setActive(i)}
              className={clsx("flex w-full items-center gap-3 px-3 py-3 text-left", i === active ? "bg-rose" : "bg-white")}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-ink">{it.name}</p>
                <p className="truncate text-xs text-muted">
                  {it.sku}
                  {it.category_name ? ` · ${it.category_name}` : ""}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-display text-base font-bold">
                  {formatQty(it.quantity)} <span className="text-sm font-semibold text-muted">{it.unit_symbol}</span>
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
