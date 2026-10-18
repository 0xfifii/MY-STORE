"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";

export function SortHeader({ col, label, align = "left", defaultSort = "name", className = "" }: { col: string; label: string; align?: "left" | "right"; defaultSort?: string; className?: string }) {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const sort = sp.get("sort") ?? defaultSort;
  const dir = sp.get("dir") ?? "asc";
  const active = sort === col;
  const click = () => {
    const next = new URLSearchParams(sp.toString());
    next.set("sort", col);
    next.set("dir", active && dir === "asc" ? "desc" : "asc");
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };
  const Icon = !active ? ChevronsUpDown : dir === "asc" ? ChevronUp : ChevronDown;
  return (
    <th scope="col" aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"} className={`px-4 py-3 font-semibold ${align === "right" ? "text-right" : "text-left"} ${className}`}>
      <button onClick={click} className={`inline-flex items-center gap-1 hover:text-burgundy ${active ? "text-burgundy" : ""}`}>
        {label} <Icon className="size-3.5" />
      </button>
    </th>
  );
}
