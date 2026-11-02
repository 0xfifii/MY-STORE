"use client";
import { Suspense } from "react";
import { RouteProgress } from "./motion";
import { StockInIcon, StockOutIcon } from "@/components/icons";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import clsx from "clsx";
import {
  LayoutDashboard, Boxes, FileBarChart, History, AlertTriangle, Tags, Truck, Users, Settings, Ruler, LogOut, Menu, ArchiveRestore,
  HardHat, ChartPie, ClipboardCheck, Mail, Bell, ShieldCheck, Search,
} from "@/components/hand-icons";
import { PageFinder } from "./page-finder";
import { ActivityProvider, BellButton, UnreadBadge } from "./activity-bell";
import { BusinessBanner } from "./business-banner";
import { useApp } from "./app-context";
import { VelvetWordmark } from "./logo";
import { StockDialogProvider } from "./stock-dialog";
import { api } from "@/lib/client";
import { ROLE_LABELS, type Action } from "@/lib/permissions";

export type NavItem = { href: string; label: string; icon: React.ComponentType<{ className?: string }>; perm?: Action; match?: string[]; adminOnly?: boolean; hint?: string; keywords?: string[] };

const MAIN: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, hint: "Today at a glance", keywords: ["home"] },
  { href: "/inventory", label: "Inventory", icon: Boxes, match: ["/inventory", "/items"], hint: "Every item, price and photo", keywords: ["items", "products"] },
  { href: "/stock-in", label: "Stock In", icon: StockInIcon, perm: "stock.in", hint: "Record stock received", keywords: ["receive", "purchase"] },
  { href: "/stock-out", label: "Stock Out", icon: StockOutIcon, perm: "stock.out", hint: "Record stock used or taken", keywords: ["issue", "usage"] },
  { href: "/transactions", label: "Transactions", icon: History, perm: "page.transactions", hint: "Every stock in and out", keywords: ["history", "ledger"] },
  { href: "/low-stock", label: "Low Stock", icon: AlertTriangle, perm: "page.low_stock", hint: "What needs restocking", keywords: ["out of stock", "reorder"] },
  { href: "/stock-count", label: "Stock Count", icon: ClipboardCheck, perm: "stock.count", hint: "Count shelves and fix differences" },
];
const REPORTS: NavItem[] = [
  { href: "/reports", label: "Reports", icon: FileBarChart, perm: "page.reports", hint: "Daily, monthly and movement reports", keywords: ["pdf", "movement"] },
  { href: "/reports/history", label: "Report History", icon: ArchiveRestore, perm: "page.report_history", hint: "Saved and automatic reports" },
  { href: "/audit", label: "Audit & Analytics", icon: ChartPie, perm: "audit.view", hint: "Spending, usage and trends", keywords: ["analysis"] },
  { href: "/mail", label: "Send Email", icon: Mail, perm: "mail.send", hint: "Email reports and messages", keywords: ["mail"] },
  { href: "/activity", label: "Activity", icon: Bell, hint: "What everyone has been doing", keywords: ["notifications"] },
];
const SETUP: NavItem[] = [
  { href: "/categories", label: "Categories", icon: Tags, perm: "page.setup", hint: "Group your items" },
  { href: "/suppliers", label: "Suppliers", icon: Truck, perm: "page.setup", hint: "Where stock comes from" },
  { href: "/workers", label: "Workers", icon: HardHat, perm: "page.setup", hint: "Who takes stock out", keywords: ["staff"] },
  { href: "/units", label: "Units", icon: Ruler, perm: "page.setup", hint: "Measuring units and conversions" },
  { href: "/users", label: "Users", icon: Users, perm: "users.manage", hint: "Logins and permissions", keywords: ["accounts", "staff"] },
  { href: "/settings", label: "Store Settings", icon: Settings, perm: "settings.write", hint: "Name, email and automatic reports" },
  { href: "/isura", label: "ÌṢÚRA admin", icon: ShieldCheck, adminOnly: true, hint: "Businesses and subscriptions", keywords: ["isura", "billing"] },
];

const BOTTOM: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/inventory", label: "Inventory", icon: Boxes, match: ["/inventory", "/items"] },
  { href: "/stock-in", label: "Stock In", icon: StockInIcon, perm: "stock.in" },
  { href: "/stock-out", label: "Stock Out", icon: StockOutIcon, perm: "stock.out" },
  { href: "/reports", label: "Reports", icon: FileBarChart, perm: "page.reports" },
];

function isActive(pathname: string, item: NavItem) {
  const roots = item.match ?? [item.href];
  return roots.some((r) => (r === "/reports" ? pathname === "/reports" : pathname === r || pathname.startsWith(r + "/")));
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false);
  const app = useApp();
  useEffect(() => setDrawer(false), [pathname]);
  // Ctrl/⌘ K opens the page finder anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setDrawer((d) => !d); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const nav = (
    <SidebarNav pathname={pathname} onFind={() => setDrawer(true)} />
  );

  return (
    <ActivityProvider>
    <div className="min-h-dvh lg:pl-[17.5rem]">
      {/* Desktop sidebar: a floating black panel */}
      <aside className="fixed inset-y-3 left-3 z-30 hidden w-64 flex-col overflow-hidden rounded-[28px] bg-gradient-to-b from-burgundy to-claret text-white shadow-[0_20px_50px_-25px_rgb(0_0_0/0.7)] lg:flex">
        <div className="relative flex h-full flex-col">{nav}</div>
      </aside>

      {/* Mobile top bar */}
      <header className="glass-strong sticky top-2 z-30 mx-3 mt-2 flex h-14 items-center justify-between rounded-full pl-5 pr-2 lg:hidden">
        <Link href="/dashboard" className="flex items-center" aria-label={app.storeName}>
          <VelvetWordmark className="h-8 w-auto" tagline={false} title={app.storeName} />
        </Link>
        <div className="flex items-center gap-2">
          <BellButton />
          <button onClick={() => setDrawer(true)} className="flex size-10 items-center justify-center rounded-full bg-burgundy text-white transition active:scale-90" aria-label="Open menu">
            <Menu className="size-5" />
          </button>
        </div>
      </header>

      <PageFinder open={drawer} onClose={() => setDrawer(false)} isActive={(i) => isActive(pathname, i)}
        groups={[{ label: "Daily work", items: MAIN }, { label: "Reports", items: REPORTS }, { label: "Setup", items: SETUP }]} />

      <Suspense fallback={null}><RouteProgress /></Suspense>
      <main className="mx-auto w-full max-w-7xl px-4 pb-32 pt-6 sm:px-6 lg:px-8 lg:pb-10 lg:pt-9">
        <BusinessBanner />
        <StockDialogProvider><div key={pathname} className="page-enter">{children}</div></StockDialogProvider>
      </main>

      {/* Mobile bottom navigation */}
      <nav className="glass-strong fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 grid rounded-full px-1 py-1 lg:hidden" style={{ gridTemplateColumns: `repeat(${BOTTOM.filter((i) => !i.perm || app.can(i.perm)).length}, minmax(0, 1fr))` }} aria-label="Quick navigation">
        {BOTTOM.filter((i) => !i.perm || app.can(i.perm)).map((item) => {
          const active = isActive(pathname, item);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx("flex flex-col items-center gap-0.5 rounded-full py-1.5 text-[11px] font-semibold transition-all duration-200 active:scale-90", active ? "nav-active bg-gradient-to-br from-[#111111] to-claret text-white shadow-md" : "text-muted hover:text-ink")}
              aria-current={active ? "page" : undefined}
            >
              <span className="flex h-6 items-center justify-center">
                <Icon className="size-5" />
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
    </ActivityProvider>
  );
}

function SidebarNav({ pathname, onFind }: { pathname: string; onFind: () => void }) {
  const app = useApp();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const logout = async () => {
    setBusy(true);
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.replace("/login");
    router.refresh();
  };
  const group = (label: string, items: NavItem[]) => {
    const visible = items.filter((i) => (!i.perm || app.can(i.perm)) && (!i.adminOnly || app.user.is_platform_admin));
    if (!visible.length) return null;
    return (
      <div className="mt-5">
        <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-gold/70">{label}</p>
        <ul className="space-y-0.5">
          {visible.map((item) => {
            const active = isActive(pathname, item);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={clsx(
                    "group flex items-center gap-3 rounded-full px-3.5 py-2 text-sm font-medium transition-all duration-200",
                    active ? "bg-white text-claret shadow-[inset_4px_0_0_#c9a227,0_8px_20px_-10px_rgb(0_0_0/0.5)]" : "text-white/80 hover:translate-x-1 hover:bg-white/10 hover:text-gold",
                  )}
                >
                  <Icon className={clsx("size-[18px] transition-transform duration-200 group-hover:scale-110", active && "text-gold-deep")} />
                  {item.label}
                  {item.href === "/activity" && !active ? <UnreadBadge className="ml-auto" /> : active && <span className="ml-auto size-1.5 rounded-full bg-gold" aria-hidden />}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    );
  };
  return (
    <div className="flex h-full flex-col overflow-y-auto px-3 py-5">
      <Link href="/dashboard" className="mt-2 block px-3" aria-label={app.storeName}>
        <VelvetWordmark className="h-[72px] w-auto" ink="#ffffff" paper="#111111" title={app.storeName} />
      </Link>
      <button onClick={onFind} className="mx-1 mt-5 flex items-center gap-2.5 rounded-2xl bg-white/[0.07] px-3.5 py-2.5 text-left text-sm text-white/60 ring-1 ring-white/10 transition hover:bg-white/[0.12] hover:text-white hover:ring-gold/50" data-testid="find-page">
        <Search className="size-4 text-gold" /> <span className="flex-1">Find a page</span>
        <kbd className="rounded-md border border-white/15 px-1.5 text-[10px] font-semibold text-white/50">Ctrl K</kbd>
      </button>
      {group("Daily work", MAIN)}
      {group("Reports", REPORTS)}
      {group("Setup", SETUP)}
      <div className="mt-auto rounded-3xl bg-white/10 px-4 py-3">
        <p className="truncate text-sm font-semibold">{app.user.name}</p>
        <p className="truncate text-xs text-white/60">{ROLE_LABELS[app.user.role]}</p>
        <button onClick={logout} disabled={busy} className="mt-3 flex items-center gap-2 text-sm text-white/80 hover:text-white">
          <LogOut className="size-4" /> Sign out
        </button>
      </div>
    </div>
  );
}
