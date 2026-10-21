"use client";

import { useCallback, useEffect, useState } from "react";
import { Clock, X } from "@/components/hand-icons";

const MAX = 6;
const keyOf = (scope: string) => `velvet.recent-searches.${scope}`;

function read(scope: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(keyOf(scope)) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, MAX) : [];
  } catch {
    return [];
  }
}
function write(scope: string, list: string[]) {
  try { localStorage.setItem(keyOf(scope), JSON.stringify(list)); } catch { /* storage blocked: recents just won't persist */ }
}

/** Recent search terms, kept per page in this browser. */
export function useRecentSearches(scope: string) {
  const [list, setList] = useState<string[]>([]);
  useEffect(() => setList(read(scope)), [scope]);
  // Written straight to storage (not inside a state updater) so it survives the picker closing right after.
  const add = useCallback((term: string) => {
    const t = term.trim();
    if (t.length < 2) return;
    const next = [t, ...read(scope).filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, MAX);
    write(scope, next);
    setList(next);
  }, [scope]);
  const remove = useCallback((term: string) => {
    const next = read(scope).filter((x) => x !== term);
    write(scope, next);
    setList(next);
  }, [scope]);
  const clear = useCallback(() => { setList([]); write(scope, []); }, [scope]);
  return { list, add, remove, clear };
}

/** Clear-the-box button that sits inside a search input. */
export function ClearSearchButton({ onClear, className = "" }: { onClear: () => void; className?: string }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClear}
      aria-label="Clear search"
      title="Clear search"
      className={`absolute right-2.5 top-1/2 flex h-8 -translate-y-1/2 items-center gap-1 rounded-lg bg-burgundy/8 px-2 text-xs font-semibold text-burgundy transition hover:bg-burgundy hover:text-paper ${className}`}
    >
      <X className="size-3.5" /> Clear
    </button>
  );
}

/** Panel of recent searches shown under an empty, focused search box. */
export function RecentSearchList({ list, onPick, onRemove, onClearAll, className = "" }: {
  list: string[]; onPick: (t: string) => void; onRemove: (t: string) => void; onClearAll: () => void; className?: string;
}) {
  if (!list.length) return null;
  return (
    <div
      className={`rounded-2xl bg-paper p-1.5 shadow-[0_14px_30px_-20px_rgb(82_8_16/0.6)] ring-1 ring-burgundy/15 ${className}`}
      onMouseDown={(e) => e.preventDefault()}
      data-testid="recent-searches"
    >
      <div className="flex items-center justify-between px-3 pb-1 pt-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-burgundy/60">Recent searches</p>
        <button type="button" onClick={onClearAll} className="rounded-md px-1.5 py-0.5 text-xs font-semibold text-burgundy underline-offset-2 hover:underline">
          Clear all
        </button>
      </div>
      <ul>
        {list.map((t) => (
          <li key={t} className="group flex items-center rounded-xl transition-colors hover:bg-burgundy/5">
            <button type="button" onClick={() => onPick(t)} className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2 text-left text-sm">
              <Clock className="size-4 shrink-0 text-burgundy/50" />
              <span className="truncate font-medium">{t}</span>
            </button>
            <button type="button" onClick={() => onRemove(t)} aria-label={`Remove ${t} from recent searches`}
              className="mr-1.5 rounded-lg p-1.5 text-burgundy/40 transition hover:bg-burgundy/10 hover:text-burgundy">
              <X className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
