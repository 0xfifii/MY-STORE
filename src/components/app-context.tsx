"use client";

import { createContext, useContext } from "react";
import type { Action, Role } from "@/lib/permissions";
import { can as canRole } from "@/lib/permissions";

export type AppCtx = {
  user: { id: string; name: string; email: string; role: Role };
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
  return { ...v, can: (a: Action) => canRole(v.user.role, a) };
}
