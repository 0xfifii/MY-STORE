import Link from "next/link";
import { History } from "@/components/hand-icons";
import { EmptyState, PageHeader, TxnTypeBadge } from "@/components/ui/primitives";
import { ListFilters, Pagination } from "@/components/list-filters";
import { TxnList } from "@/components/txn-list";
import { ReceiptLink } from "@/components/icons";
import { ReverseButton } from "@/components/item-actions";
import { DateRange } from "@/components/date-range";
import { requirePageUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { listTransactions } from "@/lib/inventory";
import { getSettings } from "@/lib/settings";
import { query } from "@/lib/db";
import { addDays, formatDateTime, formatMoney, formatQty, formatUnitCost, reasonLabel } from "@/lib/format";

export const metadata = { title: "Transactions" };

type SP = { q?: string; type?: string; from?: string; to?: string; page?: string; item?: string };
const D = /^\d{4}-\d{2}-\d{2}$/;

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePageUser("page.transactions");
  const sp = await searchParams;
  const s = await getSettings();
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const pageSize = 40;
  // Convert local dates to exact instants in the store's time zone.
  let from: string | null = null, to: string | null = null;
  if ((sp.from && D.test(sp.from)) || (sp.to && D.test(sp.to))) {
    const [r] = await query<{ f: string | null; t: string | null }>(
      "SELECT ($1::date)::timestamp AT TIME ZONE $3 AS f, ($2::date)::timestamp AT TIME ZONE $3 AS t",
      [sp.from && D.test(sp.from) ? sp.from : null, sp.to && D.test(sp.to) ? addDays(sp.to, 1) : null, s.timezone],
    );
    from = r.f; to = r.t;
  }
  const data = await listTransactions({
    itemId: /^[0-9a-f-]{36}$/i.test(sp.item ?? "") ? sp.item : undefined,
    q: sp.q, type: (["stock_in", "stock_out", "reversal", "revaluation"].includes(sp.type ?? "") ? sp.type : null) as "stock_in" | null,
    from, to, limit: pageSize, offset: (page - 1) * pageSize,
  });
  const sym = s.currency_symbol;
  const canReverse = can(user, "txn.reverse");

  return (
    <div>
      <PageHeader title="Transactions" description="Every stock movement, permanently recorded. Mistakes are fixed with a reversal, never by deleting." />
      <div className="flex flex-col gap-2 xl:flex-row xl:items-center">
        <div className="flex-1">
          <ListFilters
            searchPlaceholder="Search item, code, TXN no. or reference"
            selects={[{ name: "type", label: "Type", options: [
              { value: "", label: "All types" }, { value: "stock_in", label: "Stock in" }, { value: "stock_out", label: "Stock out" }, { value: "reversal", label: "Corrections" }, { value: "revaluation", label: "Price changes" },
            ] }]}
          />
        </div>
        <DateRange />
      </div>

      <div className="mt-4 glass overflow-hidden rounded-[var(--radius-card)]">
        {data.rows.length === 0 ? (
          <EmptyState icon={<History className="size-6" />} title="No transactions found" body="Stock movements appear here as soon as they're recorded." />
        ) : (
          <>
            <div className="hidden overflow-x-auto xl:block">
              <table className="w-full text-sm">
                <thead className="border-b border-white/80 bg-white/40 text-left text-muted">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Date & time</th>
                    <th className="px-4 py-3 font-semibold">Item</th>
                    <th className="px-4 py-3 font-semibold">Type</th>
                    <th className="px-4 py-3 text-right font-semibold">Quantity</th>
                    <th className="px-4 py-3 text-right font-semibold">Cost / unit</th>
                    <th className="px-4 py-3 text-right font-semibold">Value</th>
                    <th className="px-4 py-3 font-semibold">Details</th>
                    <th className="px-4 py-3 font-semibold">By</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/80">
                  {data.rows.map((t) => (
                    <tr key={t.id} className={t.reversed_by_txn_no ? "bg-canvas/60 text-muted" : ""}>
                      <td className="whitespace-nowrap px-4 py-2.5">{formatDateTime(t.occurred_at, s.timezone)}<span className="block text-xs text-muted">{t.txn_no}</span></td>
                      <td className="px-4 py-2.5"><Link href={`/items/${t.item_id}`} className="font-semibold hover:text-burgundy hover:underline">{t.item_name}</Link><span className="block text-xs text-muted">{t.item_sku}</span></td>
                      <td className="px-4 py-2.5"><TxnTypeBadge type={t.txn_type} direction={t.direction} /></td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right font-semibold">{t.txn_type === "revaluation" ? <span className="text-muted">price only</span> : <>{t.direction > 0 ? "+" : "−"}{formatQty(t.entered_quantity)} {t.entered_unit_symbol}</>}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right">{formatUnitCost(t.entered_unit_cost, sym)}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right">{formatMoney(t.total_value, sym)}</td>
                      <td className="max-w-56 px-4 py-2.5 text-xs">
                        {t.txn_type === "stock_out" && <>{reasonLabel(t.reason)}{t.recipient ? ` · to ${t.recipient}` : ""}</>}
                        {t.txn_type === "stock_in" && (t.is_opening ? "Opening stock" : t.supplier_label ?? "")}
                        {t.txn_type === "reversal" && <>Reverses {t.reverses_txn_no}: {t.correction_reason}</>}
                        {t.txn_type === "revaluation" && <>New price {formatUnitCost(t.entered_unit_cost, sym)} per {t.entered_unit_symbol} · {t.direction > 0 ? "worth up" : "worth down"} · {t.correction_reason}</>}
                        {t.reference && <span className="block text-muted">Ref {t.reference}</span>}
                        {t.reversed_by_txn_no && <span className="block font-semibold text-warn">Reversed by {t.reversed_by_txn_no}</span>}
                      </td>
                      <td className="px-4 py-2.5 text-xs">{t.user_name ?? "-"}</td>
                      <td className="px-4 py-2.5 text-right">
                        {t.txn_type !== "reversal" && t.txn_type !== "revaluation" && <ReceiptLink txnId={t.id} txnNo={t.txn_no} />}
                        {canReverse && t.txn_type !== "reversal" && t.txn_type !== "revaluation" && !t.reversed_by_txn_no && (
                          <ReverseButton txnId={t.id} txnNo={t.txn_no}
                            summary={`${t.txn_type === "stock_in" ? "Stock in" : "Stock out"} of ${formatQty(t.entered_quantity)} ${t.entered_unit_symbol} ${t.item_name} (${formatMoney(t.total_value, sym)}).`} />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="xl:hidden">
              <TxnList rows={data.rows} symbol={sym} timeZone={s.timezone} />
            </div>
          </>
        )}
        <div className="border-t border-white/80">
          <Pagination page={page} pages={Math.max(1, Math.ceil(data.total / pageSize))} total={data.total} label="transactions" />
        </div>
      </div>
    </div>
  );
}
