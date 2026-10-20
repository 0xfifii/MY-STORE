import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "@/components/hand-icons";
import { EmptyState, LinkButton, PageHeader, Panel, StatusBadge, TxnTypeBadge } from "@/components/ui/primitives";
import { StockButtons } from "@/components/stock-dialog";
import { ReceiptLink } from "@/components/icons";
import { ArchiveButton, ConversionManager, DeleteItemButton, ReverseButton } from "@/components/item-actions";
import { requirePageUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getItem, getItemConversions, getItemUnits, listTransactions } from "@/lib/inventory";
import { listUnits } from "@/lib/catalog";
import { buildReport, normaliseParams } from "@/lib/reports/engine";
import { getSettings } from "@/lib/settings";
import { formatDateTime, formatMoney, formatQty, formatUnitCost, reasonLabel, todayIn } from "@/lib/format";

export const metadata = { title: "Item" };

type SP = { from?: string; to?: string; type?: string; page?: string };

export default async function ItemPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const user = await requirePageUser("view");
  const { id } = await params;
  const sp = await searchParams;
  const item = await getItem(id);
  if (!item) notFound();
  const s = await getSettings();
  const sym = s.currency_symbol;
  const today = todayIn(s.timezone);
  const period = normaliseParams({ from: sp.from ?? today.slice(0, 8) + "01", to: sp.to ?? today, item: id, kind: "balance" }, s.timezone);
  const type = (["stock_in", "stock_out", "reversal"].includes(sp.type ?? "") ? sp.type : null) as "stock_in" | null;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);

  const [report, txns, conversions, units, allUnits] = await Promise.all([
    buildReport(period, s),
    listTransactions({ itemId: id, type, limit: 30, offset: (page - 1) * 30 }),
    getItemConversions(id),
    getItemUnits(id),
    listUnits(),
  ]);
  const b = report.balances[0];
  const pages = Math.max(1, Math.ceil(txns.total / 30));
  const canReverse = can(user, "txn.reverse");
  const globalRules = units.filter((u) => !u.is_base && !conversions.some((c) => c.unit_id === u.unit_id)).map((u) => ({ symbol: u.symbol, factor: u.factor }));

  const tab = (t: string | null, label: string) => {
    const q = new URLSearchParams({ ...(sp.from ? { from: sp.from } : {}), ...(sp.to ? { to: sp.to } : {}), ...(t ? { type: t } : {}) });
    const active = (type ?? null) === t;
    return (
      <Link href={`/items/${id}?${q}`} scroll={false} className={`rounded-full px-3 py-1.5 text-sm font-semibold ${active ? "bg-burgundy text-white" : "text-muted hover:bg-rose hover:text-burgundy"}`}>
        {label}
      </Link>
    );
  };

  return (
    <div>
      <PageHeader
        title={item.name}
        description={<>{item.sku}{item.category_name ? ` · ${item.category_name}` : ""}{item.supplier_name ? ` · usual supplier ${item.supplier_name}` : ""}{item.archived_at ? " · archived" : ""}</>}
        actions={
          <>
            <StockButtons itemId={item.id} name={item.name} size="md" archived={!!item.archived_at} />
            {can(user, "item.write") && <LinkButton href={`/items/${id}/edit`} variant="secondary"><Pencil className="size-4" /> Edit</LinkButton>}
            {can(user, "item.archive") && <ArchiveButton itemId={id} archived={!!item.archived_at} name={item.name} quantity={item.quantity} />}
            {can(user, "item.delete") && <DeleteItemButton itemId={id} name={item.name} quantity={item.quantity} unit={item.unit_symbol} afterHref="/inventory" />}
          </>
        }
      />

      <section className="grid glass overflow-hidden rounded-[var(--radius-card)] sm:grid-cols-3">
        <div className="border-b border-white/80 px-5 py-5 sm:border-b-0 sm:border-r">
          <p className="text-sm text-muted">Current balance</p>
          <p className="mt-1 font-display text-4xl font-bold tracking-tight" data-testid="item-balance">
            {formatQty(item.quantity)} <span className="text-xl text-muted">{item.unit_symbol}</span>
          </p>
          <div className="mt-2"><StatusBadge status={item.status} /></div>
        </div>
        <div className="border-b border-white/80 px-5 py-5 sm:border-b-0 sm:border-r">
          <p className="text-sm text-muted">Inventory value</p>
          <p className="mt-1 font-display text-3xl font-bold tracking-tight">{formatMoney(item.stock_value, sym)}</p>
          <p className="mt-1 text-sm text-muted">{formatUnitCost(item.avg_cost, sym)} per {item.unit_symbol} (weighted average)</p>
        </div>
        <div className="px-5 py-5">
          <p className="text-sm text-muted">Minimum stock level</p>
          <p className="mt-1 font-display text-3xl font-bold tracking-tight">{formatQty(item.min_stock_level)} <span className="text-lg text-muted">{item.unit_symbol}</span></p>
          <p className="mt-1 text-sm text-muted">{item.allow_fraction ? "Part quantities allowed" : "Whole quantities only"}</p>
        </div>
      </section>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Panel
          title="Movement for the period"
          actions={
            <form className="flex flex-wrap items-center gap-2 text-sm" action={`/items/${id}`}>
              <input type="date" name="from" defaultValue={period.from} aria-label="From" className="h-9 rounded-md border border-line px-2" />
              <span className="text-muted">to</span>
              <input type="date" name="to" defaultValue={period.to} max={today} aria-label="To" className="h-9 rounded-md border border-line px-2" />
              <button className="h-9 rounded-2xl bg-burgundy px-3 font-semibold text-white">Show</button>
            </form>
          }
        >
          {b ? (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
              <Fig label="Opening" qty={b.opening_qty} unit={b.unit} value={formatMoney(b.opening_value, sym)} />
              <Fig label="Received" qty={b.in_qty} unit={b.unit} value={formatMoney(b.in_value, sym)} sign="+" tone="text-ok" />
              <Fig label="Issued" qty={b.out_qty} unit={b.unit} value={formatMoney(b.out_value, sym)} sign="−" tone="text-burgundy" />
              <Fig label="Closing" qty={b.closing_qty} unit={b.unit} value={formatMoney(b.closing_value, sym)} strong />
              {Number(b.adj_qty) !== 0 && (
                <p className="col-span-full text-xs text-muted">Includes corrections of {Number(b.adj_qty) > 0 ? "+" : ""}{formatQty(b.adj_qty)} {b.unit} ({formatMoney(b.adj_value, sym)}).</p>
              )}
            </dl>
          ) : (
            <p className="text-sm text-muted">No data for this period.</p>
          )}
          <p className="mt-4 text-xs text-muted">Closing = Opening + Received − Issued ± Corrections, calculated from the transaction history.</p>
        </Panel>
        <Panel title="Units">
          <ConversionManager
            itemId={id}
            baseSymbol={item.unit_symbol}
            conversions={conversions}
            canEdit={can(user, "item.write")}
            globalRules={globalRules}
            units={allUnits.filter((u) => u.id !== item.unit_id).map((u) => ({ id: u.id, symbol: u.symbol, name: u.name }))}
          />
          {item.description && <p className="mt-4 border-t border-white/80 pt-3 text-sm">{item.description}</p>}
          {item.notes && <p className="mt-2 text-sm text-muted">{item.notes}</p>}
        </Panel>
      </div>

      <Panel className="mt-6" title="Stock history" bodyClass="" actions={<div className="flex gap-1">{tab(null, "All")}{tab("stock_in", "In")}{tab("stock_out", "Out")}</div>}>
        {txns.rows.length === 0 ? (
          <EmptyState title="No movements yet" body="Stock In and Stock Out entries for this item will be listed here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b border-white/80 bg-white/40 text-left text-muted">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Date</th>
                  <th className="px-4 py-2.5 font-semibold">Type</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Quantity</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Cost / unit</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Value</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Balance after</th>
                  <th className="px-4 py-2.5 font-semibold">Details</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/80">
                {txns.rows.map((t) => (
                  <tr key={t.id} className={t.reversed_by_txn_no ? "text-muted" : ""}>
                    <td className="whitespace-nowrap px-4 py-2.5">
                      {formatDateTime(t.occurred_at, s.timezone)}
                      <span className="block text-xs text-muted">{t.txn_no}{t.user_name ? ` · ${t.user_name}` : ""}</span>
                    </td>
                    <td className="px-4 py-2.5"><TxnTypeBadge type={t.txn_type} direction={t.direction} /></td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right font-semibold">
                      {t.direction > 0 ? "+" : "−"}{formatQty(t.entered_quantity)} {t.entered_unit_symbol}
                      {t.entered_unit_symbol !== t.unit_symbol && <span className="block text-xs font-normal text-muted">= {formatQty(t.quantity)} {t.unit_symbol}</span>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right">{formatUnitCost(t.entered_unit_cost, sym)}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right">{formatMoney(t.total_value, sym)}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right">{formatQty(t.balance_after)} {t.unit_symbol}</td>
                    <td className="max-w-64 px-4 py-2.5 text-xs">
                      {t.txn_type === "stock_out" && <span className="block">{reasonLabel(t.reason)}{t.recipient ? ` · to ${t.recipient}` : ""}</span>}
                      {t.txn_type === "stock_in" && <span className="block">{t.is_opening ? "Opening stock" : t.supplier_label ?? ""}</span>}
                      {t.txn_type === "reversal" && <span className="block">Reverses {t.reverses_txn_no}: {t.correction_reason}</span>}
                      {t.reference && <span className="block text-muted">Ref {t.reference}</span>}
                      {t.notes && <span className="block text-muted">{t.notes}</span>}
                      {t.reversed_by_txn_no && <span className="block font-semibold text-warn">Reversed by {t.reversed_by_txn_no}</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {t.txn_type !== "reversal" && <ReceiptLink txnId={t.id} txnNo={t.txn_no} />}
                        {canReverse && t.txn_type !== "reversal" && !t.reversed_by_txn_no && (
                        <ReverseButton txnId={t.id} txnNo={t.txn_no}
                          summary={`${t.txn_type === "stock_in" ? "Stock in" : "Stock out"} of ${formatQty(t.entered_quantity)} ${t.entered_unit_symbol} ${item.name} (${formatMoney(t.total_value, sym)}) on ${formatDateTime(t.occurred_at, s.timezone)}.`} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pages > 1 && (
          <div className="flex justify-between border-t border-white/80 px-4 py-3 text-sm">
            <span className="text-muted">Page {page} of {pages}</span>
            <div className="flex gap-3 font-semibold text-burgundy">
              {page > 1 && <Link href={`/items/${id}?${new URLSearchParams({ ...sp, page: String(page - 1) } as Record<string, string>)}`}>Previous</Link>}
              {page < pages && <Link href={`/items/${id}?${new URLSearchParams({ ...sp, page: String(page + 1) } as Record<string, string>)}`}>Next</Link>}
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}

function Fig({ label, qty, unit, value, sign, tone, strong }: { label: string; qty: string; unit: string; value: string; sign?: string; tone?: string; strong?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`font-display text-xl font-bold ${tone ?? ""} ${strong ? "text-ink" : ""}`}>
        {sign && Number(qty) > 0 ? sign : ""}{formatQty(qty)} <span className="text-sm font-semibold text-muted">{unit}</span>
      </dd>
      <dd className="text-xs text-muted">{value}</dd>
    </div>
  );
}
