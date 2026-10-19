"use client";
import { StockInIcon, StockOutIcon } from "@/components/icons";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import clsx from "clsx";
import {
  LayoutDashboard, Boxes, FileBarChart, History, AlertTriangle, Tags, Truck, Users, Settings, Ruler, LogOut, Menu, X, ArchiveRestore,
  HardHat, ChartPie,
} from "lucide-react";
import { useApp } from "./app-context";
import { StockDialogProvider } from "./stock-dialog";
import { api } from "@/lib/client";
import { ROLE_LABELS, type Action } from "@/lib/permissions";

type NavItem = { href: string; label: string; icon: React.ComponentType<{ className?: string }>; perm?: Action; match?: string[] };

const MAIN: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/inventory", label: "Inventory", icon: Boxes, match: ["/inventory", "/items"] },
  { href: "/stock-in", label: "Stock In", icon: StockInIcon, perm: "stock.in" },
  { href: "/stock-out", label: "Stock Out", icon: StockOutIcon, perm: "stock.out" },
  { href: "/transactions", label: "Transactions", icon: History },
  { href: "/low-stock", label: "Low Stock", icon: AlertTriangle },
];
const REPORTS: NavItem[] = [
  { href: "/reports", label: "Reports", icon: FileBarChart },
  { href: "/reports/history", label: "Report History", icon: ArchiveRestore },
  { href: "/audit", label: "Usage & Audit", icon: ChartPie, perm: "audit.view" },
];
const SETUP: NavItem[] = [
  { href: "/categories", label: "Categories", icon: Tags },
  { href: "/suppliers", label: "Suppliers", icon: Truck },
  { href: "/workers", label: "Workers", icon: HardHat },
  { href: "/units", label: "Units", icon: Ruler },
  { href: "/users", label: "Users", icon: Users, perm: "users.manage" },
  { href: "/settings", label: "Store Settings", icon: Settings, perm: "settings.write" },
];

const BOTTOM: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/inventory", label: "Inventory", icon: Boxes, match: ["/inventory", "/items"] },
  { href: "/stock-in", label: "Stock In", icon: StockInIcon, perm: "stock.in" },
  { href: "/stock-out", label: "Stock Out", icon: StockOutIcon, perm: "stock.out" },
  { href: "/reports", label: "Reports", icon: FileBarChart },
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

  const nav = (
    <SidebarNav pathname={pathname} />
  );

  return (
    <div className="min-h-dvh lg:pl-[17.5rem]">
      {/* Desktop sidebar: a floating burgundy panel */}
      <aside className="fixed inset-y-3 left-3 z-30 hidden w-64 flex-col overflow-hidden rounded-[28px] bg-claret text-white shadow-[0_20px_50px_-25px_rgb(79_16_34/0.7)] lg:flex">
        <div className="glow-orb pointer-events-none absolute -bottom-24 -left-20 size-72 rounded-full opacity-50" aria-hidden />
        <div className="relative flex h-full flex-col">{nav}</div>
      </aside>

      {/* Mobile top bar */}
      <header className="glass-strong sticky top-2 z-30 mx-3 mt-2 flex h-14 items-center justify-between rounded-full pl-5 pr-2 lg:hidden">
        <Link href="/dashboard" className="text-lg font-bold tracking-tight text-claret">
          {app.storeName}
        </Link>
        <button onClick={() => setDrawer(true)} className="flex size-10 items-center justify-center rounded-full bg-night text-white" aria-label="Open menu">
          <Menu className="size-5" />
        </button>
      </header>

      {/* Mobile drawer */}
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-claret-deep/40 backdrop-blur-sm" onClick={() => setDrawer(false)} />
          <aside className="animate-sheet absolute inset-y-2 right-2 flex w-72 max-w-[85vw] flex-col overflow-hidden rounded-[28px] bg-claret text-white">
            <button onClick={() => setDrawer(false)} className="absolute right-3 top-3 rounded p-2 hover:bg-white/10" aria-label="Close menu">
              <X className="size-5" />
            </button>
            {nav}
          </aside>
        </div>
      )}

      <main className="mx-auto w-full max-w-7xl px-4 pb-32 pt-6 sm:px-6 lg:px-8 lg:pb-10 lg:pt-9">
        <StockDialogProvider>{children}</StockDialogProvider>
      </main>

      {/* Mobile bottom navigation */}
      <nav className="glass-strong fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 grid grid-cols-5 rounded-full px-1 py-1 lg:hidden" aria-label="Quick navigation">
        {BOTTOM.filter((i) => !i.perm || app.can(i.perm)).map((item) => {
          const active = isActive(pathname, item);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx("flex flex-col items-center gap-0.5 rounded-full py-1.5 text-[11px] font-semibold", active ? "bg-night text-white" : "text-muted")}
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
  );
}

function SidebarNav({ pathname }: { pathname: string }) {
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
    const visible = items.filter((i) => !i.perm || app.can(i.perm));
    if (!visible.length) return null;
    return (
      <div className="mt-5">
        <p className="px-3 pb-1.5 text-xs font-medium text-white/45">{label}</p>
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
                    "flex items-center gap-3 rounded-full px-3.5 py-2 text-sm font-medium transition-colors",
                    active ? "bg-white text-claret shadow-sm" : "text-white/80 hover:bg-white/10 hover:text-white",
                  )}
                >
                  <Icon className="size-[18px]" />
                  {item.label}
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
      <Link href="/dashboard" className="px-3">
        <span className="text-2xl font-bold tracking-tight">{app.storeName}</span>
        <span className="block text-xs text-white/55">Inventory</span>
      </Link>
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
