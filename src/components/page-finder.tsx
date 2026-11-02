"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Search, X, Plus, LogOut, ChevronRight } from "@/components/hand-icons";
import { StockInIcon, StockOutIcon } from "@/components/icons";
import { useApp } from "./app-context";
import { UnreadBadge } from "./activity-bell";
import { VelvetWordmark } from "./logo";
import { api } from "@/lib/client";
import { ROLE_LABELS } from "@/lib/permissions";
import type { NavItem } from "./app-shell";

export type NavGroup = { label: string; items: NavItem[] };

/**
 * The page menu: search for a page, quick actions, and every page as a tile with a short description.
 * Opens full-screen on phones (menu button) and as a centred panel on desktop (sidebar button or Ctrl/⌘ K).
 * Arrow keys move, Enter opens, Esc closes.
 */
export function PageFinder({ open, onClose, groups, isActive }: {
  open: boolean; onClose: () => void; groups: NavGroup[]; isActive: (item: NavItem) => boolean;
}) {
  const app = useApp();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const box = useRef<HTMLInputElement>(null);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setQ(""); setCursor(0); setLeaving(false);
    const t = setTimeout(() => { if (window.matchMedia("(pointer: fine)").matches) box.current?.focus(); }, 60);
    document.body.style.overflow = "hidden";
    return () => { clearTimeout(t); document.body.style.overflow = ""; };
  }, [open]);

  const visible = useMemo(() => groups.map((g) => ({
    ...g,
    items: g.items.filter((i) => (!i.perm || app.can(i.perm)) && (!i.adminOnly || app.user.is_platform_admin)),
  })).filter((g) => g.items.length), [groups, app]);

  const needle = q.trim().toLowerCase();
  const filtered = useMemo(() => !needle ? visible : visible.map((g) => ({
    ...g,
    items: g.items.filter((i) => `${i.label} ${i.hint ?? ""} ${(i.keywords ?? []).join(" ")}`.toLowerCase().includes(needle)),
  })).filter((g) => g.items.length), [visible, needle]);
  const flat = filtered.flatMap((g) => g.items);

  const close = () => { setLeaving(true); setTimeout(onClose, 160); };
  const go = (href: string) => { router.push(href); close(); };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); close(); }
    if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, flat.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
    if (e.key === "Enter" && flat[cursor]) { e.preventDefault(); go(flat[cursor].href); }
  };

  const logout = async () => {
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.replace("/login");
    router.refresh();
  };

  if (!open) return null;
  let n = -1;
  const quick = [
    app.can("stock.in") && { href: "/stock-in", label: "Stock In", icon: StockInIcon },
    app.can("stock.out") && { href: "/stock-out", label: "Stock Out", icon: StockOutIcon },
    app.can("item.write") && { href: "/items/new", label: "Add item", icon: Plus },
  ].filter(Boolean) as { href: string; label: string; icon: React.ComponentType<{ className?: string }> }[];

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Find a page" onKeyDown={onKey} data-testid="page-finder">
      <div className={clsx("absolute inset-0 bg-black/45 backdrop-blur-[6px] transition-opacity duration-200", leaving ? "opacity-0" : "finder-fade")} onClick={close} />
      <div className={clsx(
        "finder-panel absolute inset-0 flex flex-col overflow-hidden bg-[radial-gradient(130%_90%_at_0%_0%,#262626_0%,#111111_45%,#000000_100%)] text-white",
        "lg:inset-x-0 lg:bottom-auto lg:top-[8vh] lg:mx-auto lg:max-h-[84vh] lg:w-[min(760px,92vw)] lg:rounded-[32px] lg:shadow-[0_40px_90px_-30px_rgb(0_0_0/0.9)] lg:ring-1 lg:ring-gold/25",
        leaving && "finder-out",
      )}>
        {/* Top: logo, search, close */}
        <div className="px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6">
          <div className="flex items-center justify-between">
            <VelvetWordmark className="h-8 w-auto" tagline={false} ink="#ffffff" paper="#111111" title={app.storeName} />
            <button onClick={close} aria-label="Close menu" className="flex size-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:rotate-90 hover:bg-gold hover:text-[#111111] active:scale-90">
              <X className="size-5" />
            </button>
          </div>
          <div className="relative mt-4">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-gold" aria-hidden />
            <input
              ref={box}
              value={q}
              onChange={(e) => { setQ(e.target.value); setCursor(0); }}
              placeholder="Find a page, e.g. stock out, reports"
              aria-label="Find a page"
              autoComplete="off"
              enterKeyHint="go"
              className="h-13 w-full rounded-2xl border-2 border-white/10 bg-white/[0.07] py-3.5 pl-12 pr-24 text-[16px] font-medium text-white placeholder:text-white/40 transition focus:border-gold focus:bg-white/[0.1] focus:outline-none"
            />
            {q ? (
              <button onClick={() => { setQ(""); box.current?.focus(); }} className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg bg-white/10 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-gold hover:text-[#111111]">Clear</button>
            ) : (
              <kbd className="absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-md border border-white/15 px-1.5 py-0.5 text-[11px] font-semibold text-white/50 lg:block">Ctrl K</kbd>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-6 sm:px-6">
          {/* Quick actions */}
          {!needle && quick.length > 0 && (
            <div className="mb-5 grid grid-cols-3 gap-2.5">
              {quick.map((a, i) => {
                const Icon = a.icon;
                return (
                  <Link key={a.href} href={a.href} onClick={close} style={{ animationDelay: `${i * 40}ms` }}
                    className="finder-tile group flex flex-col items-center gap-2 rounded-[22px] bg-gradient-to-br from-[#e3c463] to-gold px-2 py-4 text-[13px] font-bold text-[#111111] shadow-[0_14px_28px_-16px_rgb(201_162_39/0.9)] transition active:scale-95 hover:-translate-y-0.5">
                    <span className="flex size-10 items-center justify-center rounded-full bg-[#111111] text-gold transition group-hover:scale-110"><Icon className="size-5" /></span>
                    {a.label}
                  </Link>
                );
              })}
            </div>
          )}

          {/* Pages */}
          {filtered.map((g) => (
            <section key={g.label} className="mb-5">
              <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-gold/80">{g.label}</p>
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {g.items.map((item) => {
                  n += 1;
                  const idx = n;
                  const on = isActive(item);
                  const hot = idx === cursor && (needle || cursor > 0);
                  const Icon = item.icon;
                  return (
                    <li key={item.href} className="finder-tile" style={{ animationDelay: `${Math.min(idx, 12) * 25 + 60}ms` }}>
                      <Link href={item.href} onClick={close} onMouseEnter={() => setCursor(idx)} aria-current={on ? "page" : undefined}
                        className={clsx(
                          "group flex items-center gap-3 rounded-[20px] p-2.5 pr-3 transition duration-200 active:scale-[.98]",
                          on ? "bg-white text-[#111111] shadow-[inset_4px_0_0_#c9a227]" : hot ? "bg-white/[0.14] ring-1 ring-gold/60" : "bg-white/[0.06] hover:bg-white/[0.12]",
                        )}>
                        <span className={clsx("flex size-11 shrink-0 items-center justify-center rounded-2xl transition duration-200 group-hover:scale-105",
                          on ? "bg-[#111111] text-gold" : "bg-white/10 text-gold group-hover:bg-gold group-hover:text-[#111111]")}>
                          <Icon className="size-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.01em]">
                            {item.label}
                            {item.href === "/activity" && <UnreadBadge />}
                            {on && <span className="rounded-full bg-gold px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-[#111111]">Here</span>}
                          </span>
                          {item.hint && <span className={clsx("block truncate text-xs", on ? "text-[#111111]/55" : "text-white/50")}>{item.hint}</span>}
                        </span>
                        <ChevronRight className={clsx("size-4 shrink-0 transition-transform duration-200 group-hover:translate-x-1", on ? "text-gold-deep" : "text-white/30 group-hover:text-gold")} />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          {needle && !flat.length && (
            <p className="rounded-2xl bg-white/[0.06] px-4 py-8 text-center text-sm text-white/60">No page called “{q}”. Try “stock”, “report” or “users”.</p>
          )}
        </div>

        {/* Who's signed in */}
        <div className="flex items-center justify-between gap-3 border-t border-white/10 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gold text-sm font-bold text-[#111111]">{app.user.name.slice(0, 1).toUpperCase()}</span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{app.user.name}</span>
              <span className="block truncate text-xs text-white/50">{ROLE_LABELS[app.user.role]}</span>
            </span>
          </div>
          <button onClick={logout} className="flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-2 text-sm font-semibold transition hover:bg-gold hover:text-[#111111]">
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
