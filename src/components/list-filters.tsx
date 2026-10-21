"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Search } from "@/components/hand-icons";
import { Select, Spinner } from "./ui/primitives";
import { ClearSearchButton, RecentSearchList, useRecentSearches } from "./recent-searches";

type Opt = { value: string; label: string };

/** URL-driven search + filter bar (so filters survive refresh and can be shared). */
export function ListFilters({
  searchPlaceholder, selects = [],
}: {
  searchPlaceholder: string;
  selects?: { name: string; label: string; options: Opt[] }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [pending, start] = useTransition();
  const first = useRef(true);
  const box = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const autoFocusing = useRef(false);
  const recent = useRecentSearches(pathname);

  // Ready to type: focus the search on computers (not phones, where it would pop the keyboard),
  // and "/" jumps back to it from anywhere on the page.
  useEffect(() => {
    if (window.matchMedia("(pointer: fine)").matches && !document.querySelector("[role=dialog]")) {
      autoFocusing.current = true; // don't pop the recent list over the page on load
      box.current?.focus({ preventScroll: true });
    }
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test(t.tagName) && !t.isContentEditable) { e.preventDefault(); box.current?.focus(); box.current?.select(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const push = (patch: Record<string, string>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) { if (v) next.set(k, v); else next.delete(k); }
    next.delete("page");
    start(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  };

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const t = setTimeout(() => push({ q }), 250);
    const r = setTimeout(() => recent.add(q), 1500); // remember a search once the person stops typing
    return () => { clearTimeout(t); clearTimeout(r); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="relative min-w-0 flex-1 sm:min-w-64">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-burgundy/70" aria-hidden />
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
          }}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          autoComplete="off"
          className="h-12 w-full rounded-2xl border border-burgundy/15 bg-paper pl-11 pr-24 text-[15px] shadow-[0_6px_18px_-14px_rgb(82_8_16/0.6)] placeholder:text-burgundy/40 transition focus:border-burgundy/50 focus:bg-paper focus:outline-none focus:ring-4 focus:ring-burgundy/10 [&::-webkit-search-cancel-button]:hidden"
        />
        {pending && <Spinner className={`absolute top-1/2 size-4 -translate-y-1/2 ${q ? "right-[5.5rem]" : "right-3"}`} />}
        {q && <ClearSearchButton onClear={() => { setQ(""); setFocused(true); box.current?.focus(); }} />}
        {focused && !q && (
          <RecentSearchList
            list={recent.list}
            onPick={(t) => { setQ(t); recent.add(t); }}
            onRemove={recent.remove}
            onClearAll={recent.clear}
            className="absolute inset-x-0 top-full z-30 mt-2"
          />
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:flex [&>*:last-child:nth-child(odd)]:col-span-2">
        {selects.map((s) => (
          <Select key={s.name} aria-label={s.label} value={sp.get(s.name) ?? ""} onChange={(e) => push({ [s.name]: e.target.value })} className="rounded-2xl border-burgundy/15 bg-paper sm:w-44">
            {s.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        ))}
      </div>
    </div>
  );
}

export function Pagination({ page, pages, total, label }: { page: number; pages: number; total: number; label: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  if (pages <= 1) return <p className="px-4 py-3 text-sm text-muted sm:px-5">{total} {label}</p>;
  const go = (p: number) => {
    const next = new URLSearchParams(sp.toString());
    next.set("page", String(p));
    router.push(`${pathname}?${next.toString()}`);
  };
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm sm:px-5">
      <p className="text-muted">{total} {label} · page {page} of {pages}</p>
      <div className="flex gap-2">
        <button disabled={page <= 1} onClick={() => go(page - 1)} className="h-9 rounded-xl bg-paper px-4 font-semibold text-burgundy ring-1 ring-burgundy/15 transition hover:bg-burgundy hover:text-paper disabled:opacity-40 disabled:hover:bg-paper disabled:hover:text-burgundy">Previous</button>
        <button disabled={page >= pages} onClick={() => go(page + 1)} className="h-9 rounded-xl bg-paper px-4 font-semibold text-burgundy ring-1 ring-burgundy/15 transition hover:bg-burgundy hover:text-paper disabled:opacity-40 disabled:hover:bg-paper disabled:hover:text-burgundy">Next</button>
      </div>
    </div>
  );
}
