"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function DateRange() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const set = (k: "from" | "to", v: string) => {
    const next = new URLSearchParams(sp.toString());
    if (v) next.set(k, v); else next.delete(k);
    next.delete("page");
    router.replace(`${pathname}?${next}`, { scroll: false });
  };
  return (
    <div className="flex items-center gap-2 text-sm">
      <input type="date" aria-label="From date" value={sp.get("from") ?? ""} onChange={(e) => set("from", e.target.value)} className="h-11 min-w-0 flex-1 rounded-full border border-white bg-white/70 bg-white px-2" />
      <span className="text-muted">to</span>
      <input type="date" aria-label="To date" value={sp.get("to") ?? ""} onChange={(e) => set("to", e.target.value)} className="h-11 min-w-0 flex-1 rounded-full border border-white bg-white/70 bg-white px-2" />
    </div>
  );
}
