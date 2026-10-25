"use client";

import { createContext, useContext } from "react";
import type { Action, Role } from "@/lib/permissions";
import { can as canRole } from "@/lib/permissions";

export type AppCtx = {
  user: {
    id: string; name: string; email: string; role: Role; permissions: string[] | null; allowed_category_ids: number[] | null;
    is_platform_admin: boolean; store_id: number; home_store_id: number; store_name: string; paid_until: string | null;
  };
  storeName: string;
  currencySymbol: string;
  currencyCode: string;
  timezone: string;
};

const Ctx = createContext<AppCtx | null>(null);

export function AppProvider({ value, children }: { value: AppCtx; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp outside AppProvider");
  return { ...v, can: (a: Action) => canRole(v.user, a) };
}
