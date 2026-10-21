"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Bell } from "@/components/hand-icons";
import { useToast } from "./ui/toast";
import { useApp } from "./app-context";

type Latest = { key: string; user_name: string | null; title: string; detail: string | null };
const Ctx = createContext<number>(0);
export const useUnreadActivity = () => useContext(Ctx);

/**
 * Checks for new activity every 30 seconds (and when the tab comes back into view), keeps the bell count
 * up to date and pops a notification for each new thing someone else did.
 */
export function ActivityProvider({ children }: { children: React.ReactNode }) {
  const app = useApp();
  const pathname = usePathname();
  const toast = useToast();
  const [count, setCount] = useState(0);
  const shown = useRef<Set<string> | null>(null);
  const enabled = app.can("activity.view");

  const check = useCallback(async () => {
    try {
      const res = await fetch("/api/activity/unread", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { count: number; latest: Latest[] };
      setCount(data.count);
      if (shown.current === null) { shown.current = new Set(data.latest.map((x) => x.key)); return; } // don't replay old ones on load
      const fresh = data.latest.filter((x) => !shown.current!.has(x.key)).reverse();
      for (const x of fresh.slice(-3)) {
        shown.current.add(x.key);
        if (!location.pathname.startsWith("/activity")) toast.notice(`${x.user_name ?? "Someone"}: ${x.title}`, x.detail ?? undefined, "/activity");
      }
    } catch { /* offline: try again next time */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!enabled) return;
    check();
    const t = setInterval(() => { if (document.visibilityState === "visible") check(); }, 30000);
    const onVis = () => document.visibilityState === "visible" && check();
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, [enabled, check]);

  // Opening Activity marks everything as seen.
  useEffect(() => { if (enabled && pathname.startsWith("/activity")) setCount(0); }, [pathname, enabled]);

  return <Ctx.Provider value={count}>{children}</Ctx.Provider>;
}

export function UnreadBadge({ className = "" }: { className?: string }) {
  const n = useUnreadActivity();
  if (!n) return null;
  return (
    <span className={`inline-flex min-w-5 items-center justify-center rounded-md bg-gold px-1.5 text-[11px] font-bold leading-5 text-claret ${className}`} data-testid="activity-badge">
      {n > 99 ? "99+" : n}
    </span>
  );
}

/** Bell button for the phone top bar. */
export function BellButton() {
  const app = useApp();
  const n = useUnreadActivity();
  if (!app.can("activity.view")) return null;
  return (
    <Link href="/activity" aria-label={n ? `${n} new activities` : "Activity"} className="relative flex size-10 items-center justify-center rounded-xl bg-paper text-burgundy ring-1 ring-burgundy/15 transition active:scale-90">
      <Bell className="size-5" />
      {n > 0 && <span className="absolute -right-1 -top-1 flex min-w-5 items-center justify-center rounded-md bg-burgundy px-1 text-[10px] font-bold leading-5 text-paper ring-2 ring-paper">{n > 99 ? "99+" : n}</span>}
    </Link>
  );
}
