"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Spinner } from "./ui/primitives";
import { api } from "@/lib/client";

type Hit = { id: string; name: string; sku: string; category: string | null; unit: string; archived: boolean };

/**
 * Search box for the item performance view. Results load as you type without leaving the box;
 * arrow keys + Enter pick a result. A month picker sits next to it.
 */
export function AuditItemSearch({ month, maxMonth, itemName }: { month: string; maxMonth: string; itemName: string | null }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  useEffect(() => {
    if (!q.trim()) { setHits([]); return; }
    let live = true;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const d = await api<{ items: Hit[] }>(`/api/audit/items?q=${encodeURIComponent(q)}`);
        if (live) { setHits(d.items); setActive(0); setOpen(true); }
      } catch { /* ignore */ } finally { if (live) setLoading(false); }
    }, 180);
    return () => { live = false; clearTimeout(t); };
  }, [q]);

  const go = (patch: Record<string, string>) => {
    const n = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) n.set(k, v);
    router.replace(`${pathname}?${n}`, { scroll: false });
  };
  const pick = (h: Hit) => { setOpen(false); setQ(""); go({ tab: "item", item: h.id }); input.current?.focus(); };

  return (
    <div className="glass flex flex-col gap-3 rounded-[var(--radius-card)] p-3 sm:flex-row sm:items-center sm:p-4">
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <input
          ref={input}
          autoFocus={!itemName}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => hits.length && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, hits.length - 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            if (e.key === "Enter" && hits[active]) { e.preventDefault(); pick(hits[active]); }
            if (e.key === "Escape") setOpen(false);
          }}
          placeholder={itemName ? `Showing ${itemName} — search another item or category` : "Search any item by name, code or category"}
          aria-label="Search items"
          role="combobox"
          aria-expanded={open}
          aria-controls="audit-item-results"
          className="h-12 w-full rounded-full border border-white bg-white/80 pl-11 pr-10 text-[15px] transition focus:bg-white focus:outline-none focus:ring-4 focus:ring-burgundy/10"
        />
        {loading && <Spinner className="absolute right-4 top-1/2 size-4 -translate-y-1/2" />}
        {open && q.trim() && (
          <ul id="audit-item-results" role="listbox" className="absolute inset-x-0 top-full z-20 mt-2 max-h-80 overflow-auto rounded-3xl bg-white p-1.5 shadow-xl ring-1 ring-line">
            {hits.length ? hits.map((h, i) => (
              <li key={h.id} role="option" aria-selected={i === active}>
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(h)} onMouseEnter={() => setActive(i)}
                  className={`flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-2 text-left text-sm transition ${i === active ? "bg-rose" : ""}`}>
                  <span className="min-w-0"><span className="block truncate font-semibold">{h.name}{h.archived ? " (archived)" : ""}</span><span className="text-xs text-muted">{h.sku}{h.category ? ` · ${h.category}` : ""}</span></span>
                  <span className="shrink-0 text-xs text-muted">{h.unit}</span>
                </button>
              </li>
            )) : <li className="px-3 py-3 text-sm text-muted">{loading ? "Searching…" : "No items match."}</li>}
          </ul>
        )}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <span className="font-medium text-muted">Month</span>
        <input type="month" value={month} max={maxMonth} onChange={(e) => e.target.value && go({ month: e.target.value })}
          className="h-12 rounded-full bg-white/80 px-4 ring-1 ring-white focus:outline-none focus:ring-4 focus:ring-burgundy/10" />
      </label>
    </div>
  );
}
