"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Search, Plus, Clock, X, ChevronRight } from "@/components/hand-icons";
import clsx from "clsx";
import { api } from "@/lib/client";
import { formatQty, type StockStatus } from "@/lib/format";
import { Spinner, buttonClass } from "./ui/primitives";
import { useRecentSearches } from "./recent-searches";

export type PickerItem = {
  id: string;
  name: string;
  sku: string;
  category_name: string | null;
  unit_symbol: string;
  quantity: string;
  status: StockStatus;
  has_photo?: boolean;
  photo_v?: string;
};

type Cat = { id: number; name: string };

/** Shows the matched part of a name in bold so you can see why an item came up. */
function Highlight({ text, q, on }: { text: string; q: string; on: boolean }) {
  const t = q.trim();
  const i = t ? text.toLowerCase().indexOf(t.toLowerCase()) : -1;
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded-[4px] bg-black/[0.08] px-0.5 font-bold text-[#111111]">{text.slice(i, i + t.length)}</mark>
      {text.slice(i + t.length)}
    </>
  );
}

function Thumb({ it }: { it: PickerItem }) {
  if (it.has_photo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={`/api/items/${it.id}/photo?v=${it.photo_v ?? ""}`} alt="" className="size-12 shrink-0 rounded-2xl object-cover" />;
  }
  const initials = it.name.replace(/\(.*?\)/g, " ").replace(/[^\p{L} ]/gu, " ").split(/\s+/).filter((w) => w.length > 1).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return (
    <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[#111111] text-[15px] font-bold tracking-[-0.03em] text-white">
      {initials || "?"}
    </span>
  );
}

const DOT: Record<StockStatus, string> = { in_stock: "bg-[#1a1a1a]", low: "bg-gold", out: "bg-bad" };
const STATUS_TEXT: Record<StockStatus, string> = { in_stock: "In stock", low: "Running low", out: "Out of stock" };

/**
 * Item finder for Stock In / Stock Out: a big search box, category chips, recent searches as chips,
 * and results as clear cards (photo or initials, what's left, status). Arrow keys + Enter work too.
 * `compact` keeps the results hidden until you type or tap the box (used inside multi-line forms).
 */
export function ItemPicker({
  onSelect, autoFocus, addNewHref, placeholder = "Search items, e.g. rice", compact = false,
}: {
  onSelect: (item: PickerItem) => void;
  autoFocus?: boolean;
  addNewHref?: (q: string) => string;
  placeholder?: string;
  compact?: boolean;
}) {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<number | null>(null);
  const [cats, setCats] = useState<Cat[]>([]);
  const [results, setResults] = useState<PickerItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(!compact);
  const reqId = useRef(0);
  const box = useRef<HTMLInputElement>(null);
  const recent = useRecentSearches("item-picker");
  const pick = (it: PickerItem) => { recent.add(q.trim() || it.name); onSelect(it); };

  useEffect(() => {
    if (compact) return;
    api<{ categories: Cat[] }>("/api/categories").then((d) => setCats(d.categories)).catch(() => {});
  }, [compact]);

  useEffect(() => {
    if (!open) return;
    const id = ++reqId.current;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q, pageSize: "10", sort: "name" });
        if (category) params.set("category", String(category));
        const data = await api<{ rows: PickerItem[]; total: number }>(`/api/items?${params}`);
        if (id === reqId.current) {
          setResults(data.rows);
          setTotal(data.total ?? data.rows.length);
          setActive(0);
          setError(null);
        }
      } catch (e) {
        if (id === reqId.current) setError((e as Error).message);
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    }, q ? 160 : 0);
    return () => clearTimeout(t);
  }, [q, category, open]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, results.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    if (e.key === "Enter" && !loading && results[active]) { e.preventDefault(); pick(results[active]); }
    if (e.key === "Escape" && q) { e.preventDefault(); setQ(""); }
  };

  const chip = (on: boolean) => clsx(
    "shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition duration-200 active:scale-95",
    on ? "chip-pop bg-[#111111] text-white shadow-[0_8px_16px_-10px_rgb(0_0_0/0.8)]" : "bg-white text-[#111111]/70 ring-1 ring-black/10 hover:text-[#111111] hover:ring-black/25",
  );

  return (
    <div className="item-picker">
      {/* Search box */}
      <div className="group relative">
        <span className={clsx("pointer-events-none absolute left-2 top-1/2 z-10 flex size-10 -translate-y-1/2 items-center justify-center rounded-[14px] transition-colors duration-300",
          "bg-[#111111] text-white")}>
          <Search className="size-[18px]" aria-hidden />
        </span>
        <input
          ref={box}
          autoFocus={autoFocus}
          autoComplete="off"
          enterKeyHint="search"
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
          placeholder={placeholder}
          aria-label="Search items"
          role="combobox"
          aria-expanded={open}
          aria-controls="item-picker-list"
          className="h-14 w-full rounded-[20px] border-2 border-transparent bg-white pl-14 pr-24 text-[16px] font-medium text-[#111111] shadow-[0_12px_30px_-22px_rgb(0_0_0/0.7)] ring-1 ring-black/5 transition placeholder:font-normal placeholder:text-[#111111]/40 focus:border-[#111111] focus:outline-none"
        />
        {loading && <Spinner className={`absolute top-1/2 size-5 -translate-y-1/2 ${q ? "right-[5.5rem]" : "right-4"}`} />}
        {q && (
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { setQ(""); box.current?.focus(); }}
            aria-label="Clear search" className="absolute right-2.5 top-1/2 flex h-9 -translate-y-1/2 items-center gap-1 rounded-xl bg-[#111111] px-2.5 text-xs font-semibold text-white transition hover:bg-[#2b2b2b]">
            <X className="size-3.5" /> Clear
          </button>
        )}
      </div>

      {open && (
        <div className="pop-in">
          {/* Category chips */}
          {!compact && cats.length > 0 && (
            <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="Filter by category">
              <button type="button" className={chip(category === null)} onClick={() => setCategory(null)} aria-pressed={category === null}>All</button>
              {cats.map((c) => (
                <button key={c.id} type="button" className={chip(category === c.id)} aria-pressed={category === c.id}
                  onClick={() => setCategory(category === c.id ? null : c.id)}>{c.name}</button>
              ))}
            </div>
          )}

          {/* Recent searches as chips */}
          {!q && recent.list.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5" data-testid="recent-searches">
              <span className="mr-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#111111]/45"><Clock className="size-3.5" /> Recent</span>
              {recent.list.map((t) => (
                <span key={t} className="group/chip flex items-center rounded-full bg-white text-[13px] font-semibold text-[#111111] ring-1 ring-black/10">
                  <button type="button" onClick={() => { setQ(t); box.current?.focus(); }} className="py-1 pl-3 pr-1">{t}</button>
                  <button type="button" onClick={() => recent.remove(t)} aria-label={`Remove ${t}`} className="mr-1 rounded-full p-0.5 opacity-60 hover:bg-black/10 hover:opacity-100">
                    <X className="size-3" />
                  </button>
                </span>
              ))}
              <button type="button" onClick={recent.clear} className="ml-1 text-xs font-semibold text-[#111111]/50 underline-offset-2 hover:text-[#111111] hover:underline">Clear all</button>
            </div>
          )}

          {error && <p className="mt-2 text-sm text-bad">{error}</p>}

          <div className="mt-3 flex items-center justify-between px-1 text-xs text-[#111111]/50">
            <span>{loading ? "Searching…" : q ? `${total} match${total === 1 ? "" : "es"}` : category ? `${total} in this category` : "Pick an item"}</span>
            <span className="hidden sm:inline">↑ ↓ to move · Enter to choose</span>
          </div>

          {/* Results */}
          <ul id="item-picker-list" role="listbox" className="stagger mt-1.5 max-h-[26rem] space-y-1.5 overflow-y-auto p-0.5">
            {results.map((it, i) => {
              const on = i === active;
              return (
                <li key={it.id} role="option" aria-selected={on}>
                  <button
                    type="button"
                    onClick={() => pick(it)}
                    onMouseEnter={() => setActive(i)}
                    className={clsx(
                      "group/row flex w-full items-center gap-3 rounded-[20px] p-2 pr-3 text-left transition duration-200 active:scale-[.98]",
                      on ? "bg-white ring-2 ring-[#111111] shadow-[0_14px_28px_-18px_rgb(0_0_0/0.6)]" : "bg-white ring-1 ring-black/5",
                    )}
                  >
                    <Thumb it={it} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-semibold tracking-[-0.01em]"><Highlight text={it.name} q={q} on={on} /></p>
                      <p className="truncate text-xs text-[#111111]/50">
                        {it.sku}{it.category_name ? ` · ${it.category_name}` : ""}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[17px] font-bold tabular-nums leading-tight">
                        {formatQty(it.quantity)} <span className={clsx("text-xs font-semibold", "text-[#111111]/50")}>{it.unit_symbol}</span>
                      </p>
                      <p className="mt-0.5 flex items-center justify-end gap-1.5 text-[11px] font-semibold text-[#111111]/55">
                        <span className={clsx("size-1.5 rounded-full", DOT[it.status])} />
                        {STATUS_TEXT[it.status]}
                      </p>
                    </div>
                    <ChevronRight className={clsx("size-4 shrink-0 transition-transform duration-200", on ? "translate-x-0.5 text-[#111111]" : "text-[#111111]/25")} />
                  </button>
                </li>
              );
            })}
            {!loading && !results.length && (
              <li className="rounded-[20px] bg-white px-4 py-7 text-center text-sm text-[#111111]/60 ring-1 ring-black/5">
                {q ? <>Nothing matches “<b className="text-[#111111]">{q}</b>”{category ? " in this category" : ""}.</> : "No items yet."}
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
      )}
    </div>
  );
}
