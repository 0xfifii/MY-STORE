"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { Modal } from "./ui/dialog";
import { StockMoveForm } from "./stock-move-form";
import { useApp } from "./app-context";
import { StockInIcon, StockOutIcon } from "./icons";

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
        title={state ? `${state.mode === "in" ? "Stock in" : "Stock out"}${state.name ? `: ${state.name}` : ""}` : ""}
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
  if (archived) return null;
  const canIn = app.can("stock.in");
  const canOut = app.can("stock.out");
  if (!canIn && !canOut) return null;
  const cls = size === "sm" ? "h-8 pl-2.5 pr-3 text-xs gap-1" : "h-10 pl-3.5 pr-4 text-sm gap-1.5";
  const ic = size === "sm" ? "size-4" : "size-[18px]";
  return (
    <div className="flex gap-1.5">
      {canIn && (
        <button type="button" onClick={() => open("in", itemId, name)} aria-label={`Stock in ${name}`}
          className={`${cls} inline-flex items-center rounded-full bg-paper font-semibold text-burgundy ring-1 ring-burgundy/30 transition-all duration-200 hover:-translate-y-px hover:bg-burgundy/5 hover:shadow-md active:scale-95`}>
          <StockInIcon className={ic} /> In
        </button>
      )}
      {canOut && (
        <button type="button" onClick={() => open("out", itemId, name)} aria-label={`Stock out ${name}`}
          className={`${cls} btn-shine inline-flex items-center rounded-full bg-burgundy font-semibold text-paper shadow-sm transition-all duration-200 hover:-translate-y-px hover:bg-burgundy-hover hover:shadow-md active:scale-95`}>
          <StockOutIcon className={ic} /> Out
        </button>
      )}
    </div>
  );
}
