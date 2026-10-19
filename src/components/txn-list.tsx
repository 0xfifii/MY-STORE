import Link from "next/link";
import { formatDateTime, formatMoney, formatQty, reasonLabel } from "@/lib/format";
import type { TxnRow } from "@/lib/inventory";
import { TxnTypeBadge } from "./ui/primitives";

/** Compact stacked list of stock movements, readable on phones. */
export function TxnList({ rows, symbol, timeZone, showItem = true }: { rows: TxnRow[]; symbol: string; timeZone: string; showItem?: boolean }) {
  return (
    <ul className="divide-y divide-white/80">
      {rows.map((t) => {
        const sign = t.direction > 0 ? "+" : "−";
        const detail =
          t.txn_type === "stock_out"
            ? [reasonLabel(t.reason), t.worker_name ? `by ${t.worker_name}` : null, t.recipient].filter(Boolean).join(" · ")
            : t.txn_type === "stock_in"
              ? t.is_opening ? "Opening stock" : t.supplier_label ?? ""
              : `Reverses ${t.reverses_txn_no}`;
        return (
          <li key={t.id} className="flex items-start gap-3 px-5 py-3 sm:px-6">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <TxnTypeBadge type={t.txn_type} direction={t.direction} />
                {showItem && (
                  <Link href={`/items/${t.item_id}`} className="truncate font-semibold hover:text-burgundy hover:underline">
                    {t.item_name}
                  </Link>
                )}
              </div>
              <p className="mt-1 truncate text-xs text-muted">
                {t.txn_no} · {formatDateTime(t.occurred_at, timeZone)}
                {detail ? ` · ${detail}` : ""}
                {t.user_name ? ` · ${t.user_name}` : ""}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className={`font-semibold ${t.direction > 0 ? "text-ok" : "text-burgundy"}`}>
                {sign}
                {formatQty(t.entered_quantity)} {t.entered_unit_symbol}
              </p>
              <p className="text-xs text-muted">{formatMoney(t.total_value, symbol)}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
