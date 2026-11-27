"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { THEME_KEY as KEY } from "@/lib/theme";

export type ThemePref = "light" | "dark" | "system";

function apply(pref: ThemePref) {
  const dark = pref === "dark" || (pref === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const root = document.documentElement;
  root.dataset.theme = dark ? "dark" : "light";
  root.dataset.themePref = pref;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#151413" : "#C65A29");
}

const Sun = () => (
  <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
    <circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);
const Moon = () => (
  <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z" />
  </svg>
);
const Auto = () => (
  <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" />
  </svg>
);

/** Light / Dark / Auto switch. Remembered on this device. */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const [pref, setPref] = useState<ThemePref>("light");
  useEffect(() => {
    let p: ThemePref = "light";
    try { p = (localStorage.getItem(KEY) as ThemePref) || "light"; } catch {}
    setPref(p);
    apply(p);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => { if ((document.documentElement.dataset.themePref as ThemePref) === "system") apply("system"); };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  const choose = (p: ThemePref) => {
    setPref(p);
    try { localStorage.setItem(KEY, p); } catch {}
    apply(p);
  };
  const opts: { v: ThemePref; label: string; icon: React.ReactNode }[] = [
    { v: "light", label: "Light", icon: <Sun /> },
    { v: "dark", label: "Dark", icon: <Moon /> },
    { v: "system", label: "Auto", icon: <Auto /> },
  ];
  return (
    <div role="radiogroup" aria-label="Appearance" className={clsx("flex rounded-full bg-black/[0.05] p-0.5", className)} data-testid="theme-toggle">
      {opts.map((o) => (
        <button key={o.v} type="button" role="radio" aria-checked={pref === o.v} onClick={() => choose(o.v)} title={o.v === "system" ? "Follow this device" : o.label}
          className={clsx("flex flex-1 items-center justify-center gap-1.5 rounded-full px-2 py-1.5 text-xs font-semibold transition",
            pref === o.v ? "bg-paper text-ink shadow-[0_4px_12px_-6px_rgb(0_0_0/0.5)]" : "text-ink/55 hover:text-ink")}>
          {o.icon}{o.label}
        </button>
      ))}
    </div>
  );
}
