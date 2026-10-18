"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import clsx from "clsx";

/** Bottom sheet on phones, centred dialog on larger screens. */
export function Modal({
  open, onClose, title, children, footer, wide, busy,
}: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean; busy?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    setTimeout(() => {
      const first = panel.current?.querySelector<HTMLElement>("[data-autofocus], input:not([type=hidden]), select, textarea, button");
      first?.focus();
    }, 20);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      prev?.focus?.();
    };
  }, [open, onClose, busy]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-claret-deep/45" onClick={() => !busy && onClose()} />
      <div
        ref={panel}
        className={clsx(
          "animate-sheet relative flex max-h-[92dvh] w-full flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-xl",
          wide ? "sm:max-w-2xl" : "sm:max-w-lg",
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <h2 className="font-display text-lg font-bold">{title}</h2>
          <button onClick={onClose} disabled={busy} className="rounded p-1 text-muted hover:bg-rose hover:text-ink" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-col-reverse gap-2 border-t border-line px-5 py-3 sm:flex-row sm:justify-end">{footer}</div>}
      </div>
    </div>
  );
}
