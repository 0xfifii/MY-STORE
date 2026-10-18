"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import clsx from "clsx";
import {
  LayoutDashboard, Boxes, PackagePlus, PackageMinus, FileBarChart, History, AlertTriangle, Tags, Truck,
  Users, Settings, Ruler, ScrollText, LogOut, Menu, X, ArchiveRestore,
} from "lucide-react";
import { useApp } from "./app-context";
import { StockDialogProvider } from "./stock-dialog";
import { api } from "@/lib/client";
import { ROLE_LABELS, type Action } from "@/lib/permissions";

type NavItem = { href: string; label: string; icon: React.ComponentType<{ className?: string }>; perm?: Action; match?: string[] };

const MAIN: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/inventory", label: "Inventory", icon: Boxes, match: ["/inventory", "/items"] },
  { href: "/stock-in", label: "Stock In", icon: PackagePlus, perm: "stock.move" },
  { href: "/stock-out", label: "Stock Out", icon: PackageMinus, perm: "stock.move" },
  { href: "/transactions", label: "Transactions", icon: History },
  { href: "/low-stock", label: "Low Stock", icon: AlertTriangle },
];
const REPORTS: NavItem[] = [
  { href: "/reports", label: "Daily Reports", icon: FileBarChart },
  { href: "/reports/history", label: "Report History", icon: ArchiveRestore },
];
const SETUP: NavItem[] = [
  { href: "/categories", label: "Categories", icon: Tags },
  { href: "/suppliers", label: "Suppliers", icon: Truck },
  { href: "/units", label: "Units", icon: Ruler },
  { href: "/users", label: "Users", icon: Users, perm: "users.manage" },
  { href: "/audit", label: "Audit Log", icon: ScrollText, perm: "audit.view" },
  { href: "/settings", label: "Store Settings", icon: Settings, perm: "settings.write" },
];

const BOTTOM: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/inventory", label: "Inventory", icon: Boxes, match: ["/inventory", "/items"] },
  { href: "/stock-in", label: "Stock In", icon: PackagePlus, perm: "stock.move" },
  { href: "/stock-out", label: "Stock Out", icon: PackageMinus, perm: "stock.move" },
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
    <div className="min-h-dvh lg:pl-64">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-claret text-white lg:flex">{nav}</aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between bg-claret px-4 text-white lg:hidden">
        <Link href="/dashboard" className="font-display text-lg font-extrabold tracking-tight">
          {app.storeName}
        </Link>
        <button onClick={() => setDrawer(true)} className="-mr-2 rounded p-2 hover:bg-white/10" aria-label="Open menu">
          <Menu className="size-6" />
        </button>
      </header>

      {/* Mobile drawer */}
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrawer(false)} />
          <aside className="animate-sheet absolute inset-y-0 right-0 flex w-72 max-w-[85vw] flex-col bg-claret text-white">
            <button onClick={() => setDrawer(false)} className="absolute right-3 top-3 rounded p-2 hover:bg-white/10" aria-label="Close menu">
              <X className="size-5" />
            </button>
            {nav}
          </aside>
        </div>
      )}

      <main className="mx-auto w-full max-w-7xl px-4 pb-28 pt-5 sm:px-6 lg:px-8 lg:pb-10 lg:pt-8">
        <StockDialogProvider>{children}</StockDialogProvider>
      </main>

      {/* Mobile bottom navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-white pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="Quick navigation">
        {BOTTOM.filter((i) => !i.perm || app.can(i.perm)).map((item) => {
          const active = isActive(pathname, item);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx("flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold", active ? "text-burgundy" : "text-muted")}
              aria-current={active ? "page" : undefined}
            >
              <span className={clsx("flex h-7 w-12 items-center justify-center rounded-full", active && "bg-rose")}>
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
        <p className="px-3 pb-1.5 text-xs font-medium text-white/50">{label}</p>
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
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    active ? "bg-white text-claret" : "text-white/85 hover:bg-white/10 hover:text-white",
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
        <span className="font-display text-2xl font-extrabold tracking-tight">{app.storeName}</span>
        <span className="block text-xs text-white/60">Inventory</span>
      </Link>
      {group("Daily work", MAIN)}
      {group("Reports", REPORTS)}
      {group("Setup", SETUP)}
      <div className="mt-auto border-t border-white/15 px-3 pt-4">
        <p className="truncate text-sm font-semibold">{app.user.name}</p>
        <p className="truncate text-xs text-white/60">{ROLE_LABELS[app.user.role]}</p>
        <button onClick={logout} disabled={busy} className="mt-3 flex items-center gap-2 text-sm text-white/80 hover:text-white">
          <LogOut className="size-4" /> Sign out
        </button>
      </div>
    </div>
  );
}
