"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Select, Spinner } from "./ui/primitives";

/** A dropdown that writes its value into the page URL (so the server re-renders with it). */
export function UrlSelect({ name, label, options, allLabel }: { name: string; label: string; options: { value: string; label: string }[]; allLabel: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  return (
    <div className="flex items-center gap-2">
      {pending && <Spinner className="size-4" />}
      <Select
        aria-label={label}
        value={sp.get(name) ?? ""}
        onChange={(e) => {
          const next = new URLSearchParams(sp.toString());
          if (e.target.value) next.set(name, e.target.value); else next.delete(name);
          start(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
        }}
        className="h-10 w-full rounded-xl border-burgundy/15 bg-paper text-sm sm:w-60"
      >
        <option value="">{allLabel}</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </Select>
    </div>
  );
}
