"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { Bell, CheckCircle2, AlertTriangle, X } from "@/components/hand-icons";

type Toast = { id: number; kind: "success" | "error" | "notice"; title: string; body?: string; href?: string };
type Ctx = {
  success: (title: string, body?: string) => void;
  error: (title: string, body?: string) => void;
  /** Activity notification (someone else did something). */
  notice: (title: string, body?: string, href?: string) => void;
};

const ToastCtx = createContext<Ctx | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const remove = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (kind: Toast["kind"], title: string, body?: string, href?: string) => {
      const id = Date.now() + Math.random();
      setToasts((t) => [...t.slice(-3), { id, kind, title, body, href }]);
      setTimeout(() => remove(id), kind === "success" ? 4500 : 7000);
    },
    [remove],
  );
  const value = {
    success: (t: string, b?: string) => push("success", t, b),
    error: (t: string, b?: string) => push("error", t, b),
    notice: (t: string, b?: string, h?: string) => push("notice", t, b, h),
  };
  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6 lg:items-end lg:pr-6"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.kind === "error" ? "alert" : "status"}
            className={`animate-toast pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border bg-white px-4 py-3 shadow-lg ${
              t.kind === "error" ? "border-bad/30" : t.kind === "notice" ? "border-burgundy/25 bg-paper" : "border-ok/30"
            }`}
          >
            {t.kind === "error" ? (
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-bad" aria-hidden />
            ) : t.kind === "notice" ? (
              <Bell className="mt-0.5 size-5 shrink-0 text-burgundy" aria-hidden />
            ) : (
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-ok" aria-hidden />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{t.title}</p>
              {t.body && <p className="mt-0.5 text-sm text-muted">{t.body}</p>}
              {t.href && <a href={t.href} className="mt-1 inline-block text-xs font-semibold text-burgundy underline-offset-2 hover:underline">See activity</a>}
            </div>
            <button onClick={() => remove(t.id)} className="text-muted hover:text-ink" aria-label="Dismiss">
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}
