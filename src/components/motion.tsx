"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Counts a number up from 0 when it first appears (and from its old value when it changes).
 * `format` turns the running number into text, so money keeps its ₦ and commas the whole way.
 */
export function CountUp({ value, decimals = 0, prefix = "", suffix = "", duration = 900, className }: {
  value: number; decimals?: number; prefix?: string; suffix?: string; duration?: number; className?: string;
}) {
  const fmt = (n: number) => prefix + n.toLocaleString("en-NG", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + suffix;
  const [shown, setShown] = useState(() => fmt(value));
  const from = useRef(0);
  useEffect(() => {
    if (reduced() || !Number.isFinite(value)) { setShown(fmt(value)); from.current = value; return; }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const e = 1 - Math.pow(1 - p, 3); // ease-out
      setShown(fmt(a + (value - a) * e));
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return <span className={className} suppressHydrationWarning>{shown}</span>;
}

/**
 * A thin black bar across the top of the screen while a page is loading, so every tap feels answered.
 * Starts on any in-app link click and finishes when the new page arrives.
 */
export function RouteProgress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement).closest("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      setState("loading");
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  useEffect(() => {
    setState((s) => (s === "loading" ? "done" : s));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 450);
  }, [pathname, search]);

  return <div aria-hidden className={`route-progress route-progress--${state}`} />;
}

/** A tick that draws itself, for "saved" moments. */
export function SuccessCheck({ className = "size-16" }: { className?: string }) {
  return (
    <svg viewBox="0 0 52 52" className={`success-check ${className}`} aria-hidden>
      <circle cx="26" cy="26" r="24" fill="none" />
      <path fill="none" d="M15 27 l7 7 l15 -16" />
    </svg>
  );
}
