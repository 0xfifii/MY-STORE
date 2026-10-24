"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import clsx from "clsx";
import { LayoutDashboard, Search } from "@/components/hand-icons";
import { Select, Spinner } from "./ui/primitives";
import { ClearSearchButton, RecentSearchList, useRecentSearches } from "./recent-searches";

type Cat = { id: number; name: string; count: number };

const STATUS: [string, string][] = [["", "All"], ["in_stock", "In stock"], ["low", "Running low"], ["out", "Out of stock"]];

/**
 * Inventory search, after the black-and-white reference: a big search bar with recent searches and a clear
 * button, category tiles you swipe through (All in black), text tabs for stock status, and sort.
 * Everything lives in the URL, so refresh and back keep your place.
 */
export function InventoryFilters({ categories, sorts, total }: { categories: Cat[]; sorts: [string, string][]; total: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [pending, start] = useTransition();
  const [focused, setFocused] = useState(false);
  const box = useRef<HTMLInputElement>(null);
  const autoFocusing = useRef(false);
  const first = useRef(true);
  const recent = useRecentSearches(pathname);
  const category = sp.get("category") ?? "";
  const status = sp.get("status") ?? "";

  const push = (patch: Record<string, string>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) { if (v) next.set(k, v); else next.delete(k); }
    next.delete("page");
    start(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  };

  useEffect(() => {
    if (window.matchMedia("(pointer: fine)").matches && !document.querySelector("[role=dialog]")) {
      autoFocusing.current = true;
      box.current?.focus({ preventScroll: true });
    }
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test(t.tagName) && !t.isContentEditable) { e.preventDefault(); box.current?.focus(); box.current?.select(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const t = setTimeout(() => push({ q }), 250);
    const r = setTimeout(() => recent.add(q), 1500);
    return () => { clearTimeout(t); clearTimeout(r); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const allCount = categories.reduce((a, c) => a + c.count, 0);
  const tile = (on: boolean) => clsx(
    "group flex h-[92px] w-[92px] shrink-0 snap-start flex-col items-center justify-center gap-2 rounded-[22px] text-[13px] font-semibold transition duration-200 active:scale-95",
    on ? "bg-[#111111] text-white shadow-[0_14px_26px_-14px_rgb(0_0_0/0.8)]" : "bg-white text-[#111111] ring-1 ring-black/5 hover:-translate-y-0.5 hover:shadow-[0_12px_22px_-16px_rgb(0_0_0/0.5)]",
  );

  return (
    <div className="space-y-4" data-testid="inventory-filters">
      {/* Search */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-5 top-1/2 size-5 -translate-y-1/2 text-[#111111]/60" aria-hidden />
        <input
          ref={box}
          type="search"
          enterKeyHint="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => { if (autoFocusing.current) autoFocusing.current = false; else setFocused(true); }}
          onClick={() => setFocused(true)}
          onBlur={() => { setFocused(false); recent.add(q); }}
          onKeyDown={(e) => {
            if (e.key === "Escape" && q) { e.preventDefault(); setQ(""); }
            if (e.key === "Enter") recent.add(q);
            if (e.key === "ArrowDown") setFocused(true);
          }}
          placeholder="Search items by name or code"
          aria-label="Search items by name or code"
          autoComplete="off"
          className="h-14 w-full rounded-[20px] border border-transparent bg-white pl-14 pr-28 text-[16px] text-[#111111] shadow-[0_10px_30px_-22px_rgb(0_0_0/0.6)] ring-1 ring-black/5 transition placeholder:text-[#111111]/40 focus:border-[#111111] focus:outline-none focus:ring-4 focus:ring-black/5 [&::-webkit-search-cancel-button]:hidden"
        />
        {pending && <Spinner className={`absolute top-1/2 size-4 -translate-y-1/2 ${q ? "right-[5.5rem]" : "right-5"}`} />}
        {q && <ClearSearchButton onClear={() => { setQ(""); setFocused(true); box.current?.focus(); }} />}
        {focused && !q && (
          <RecentSearchList list={recent.list} onPick={(t) => { setQ(t); recent.add(t); }} onRemove={recent.remove} onClearAll={recent.clear}
            className="absolute inset-x-0 top-full z-30 mt-2" />
        )}
      </div>

      {/* Category tiles */}
      {categories.length > 0 && (
        <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="Categories">
          <button type="button" onClick={() => push({ category: "" })} className={tile(!category)} aria-pressed={!category}>
            <LayoutDashboard className="size-6" />
            <span>All <span className={clsx("font-medium", !category ? "text-white/60" : "text-[#111111]/45")}>{allCount}</span></span>
          </button>
          {categories.map((c) => {
            const on = category === String(c.id);
            const initials = c.name.replace(/[^\p{L} ]/gu, " ").split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
            return (
              <button key={c.id} type="button" onClick={() => push({ category: on ? "" : String(c.id) })} className={tile(on)} aria-pressed={on} title={c.name}>
                <span className={clsx("flex size-8 items-center justify-center rounded-xl text-[12px] font-bold transition group-hover:scale-110", on ? "bg-white text-[#111111]" : "bg-[#111111] text-white")}>{initials}</span>
                <span className="max-w-[80px] truncate">{c.name}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Status tabs + sort */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-5 overflow-x-auto [scrollbar-width:none]" role="tablist" aria-label="Stock status">
          {STATUS.map(([v, label]) => {
            const on = status === v;
            return (
              <button key={v || "all"} type="button" role="tab" aria-selected={on} onClick={() => push({ status: v })}
                className={clsx("relative shrink-0 pb-1.5 text-[17px] font-bold tracking-[-0.01em] transition", on ? "text-[#111111]" : "text-[#111111]/30 hover:text-[#111111]/60")}>
                {label}
                <span className={clsx("absolute inset-x-0 -bottom-0.5 h-[3px] rounded-full bg-[#111111] transition-transform duration-300", on ? "scale-x-100" : "scale-x-0")} />
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-[#111111]/50">{total} item{total === 1 ? "" : "s"}</span>
          <Select aria-label="Sort" value={sp.get("sort") ?? ""} onChange={(e) => push({ sort: e.target.value })}
            className="h-10 w-44 rounded-xl border-transparent bg-white text-sm font-semibold ring-1 ring-black/5">
            {sorts.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </Select>
        </div>
      </div>
    </div>
  );
}
