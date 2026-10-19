"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Search } from "lucide-react";
import { Select, Spinner } from "./ui/primitives";

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

  const push = (patch: Record<string, string>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) { if (v) next.set(k, v); else next.delete(k); }
    next.delete("page");
    start(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  };

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const t = setTimeout(() => push({ q }), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="relative min-w-0 flex-1 sm:min-w-64">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          className="h-12 w-full rounded-full border border-white bg-white/75 pl-11 pr-10 text-[15px] shadow-[inset_0_1px_2px_rgb(79_16_34/0.06)] focus:bg-white focus:outline-none focus:ring-4 focus:ring-burgundy/10"
        />
        {pending && <Spinner className="absolute right-3 top-1/2 size-4 -translate-y-1/2" />}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:flex [&>*:last-child:nth-child(odd)]:col-span-2">
        {selects.map((s) => (
          <Select key={s.name} aria-label={s.label} value={sp.get(s.name) ?? ""} onChange={(e) => push({ [s.name]: e.target.value })} className="rounded-full sm:w-44">
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
        <button disabled={page <= 1} onClick={() => go(page - 1)} className="h-9 rounded-full bg-white/80 px-4 font-semibold shadow-sm disabled:opacity-40">Previous</button>
        <button disabled={page >= pages} onClick={() => go(page + 1)} className="h-9 rounded-full bg-white/80 px-4 font-semibold shadow-sm disabled:opacity-40">Next</button>
      </div>
    </div>
  );
}
