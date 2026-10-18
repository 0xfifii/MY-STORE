"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { Modal } from "./ui/dialog";
import { StockMoveForm } from "./stock-move-form";
import { useApp } from "./app-context";

type Open = (mode: "in" | "out", itemId: string, itemName?: string) => void;
const Ctx = createContext<Open | null>(null);

/** Lets any list open Stock In / Stock Out for a row without leaving the page. */
export function StockDialogProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{ mode: "in" | "out"; itemId: string; name?: string; key: number } | null>(null);
  const open = useCallback<Open>((mode, itemId, name) => setState({ mode, itemId, name, key: Date.now() }), []);
  return (
    <Ctx.Provider value={open}>
      {children}
      <Modal
        open={!!state}
        onClose={() => setState(null)}
        title={state ? `${state.mode === "in" ? "Stock in" : "Stock out"}${state.name ? ` — ${state.name}` : ""}` : ""}
      >
        {state && <StockMoveForm key={state.key} mode={state.mode} initialItemId={state.itemId} embedded />}
      </Modal>
    </Ctx.Provider>
  );
}

export function useStockDialog() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStockDialog outside provider");
  return v;
}

export function StockButtons({ itemId, name, size = "sm", archived }: { itemId: string; name: string; size?: "sm" | "md"; archived?: boolean }) {
  const open = useStockDialog();
  const app = useApp();
  if (archived || !app.can("stock.move")) return null;
  const cls = size === "sm" ? "h-8 px-2.5 text-xs" : "h-10 px-4 text-sm";
  return (
    <div className="flex gap-1.5">
      <button type="button" onClick={() => open("in", itemId, name)} className={`${cls} rounded-md border border-line bg-white font-semibold text-ok hover:bg-ok-bg`}>
        Stock In
      </button>
      <button type="button" onClick={() => open("out", itemId, name)} className={`${cls} rounded-md bg-burgundy font-semibold text-white hover:bg-burgundy-hover`}>
        Stock Out
      </button>
    </div>
  );
}
