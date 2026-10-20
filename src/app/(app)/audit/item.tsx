import Link from "next/link";
import { Panel } from "@/components/ui/primitives";
import { LineChart } from "@/components/line-chart";
import { ReceiptLink } from "@/components/icons";
import { itemMonth, shiftMonth, type ItemMonthFigures } from "@/lib/audit-analytics";
import { formatDateTime, formatMoney, formatQty, formatUnitCost, reasonLabel } from "@/lib/format";
import { Change, Empty, Td, Th } from "./ui";

const mLabel = (month: string, short = false) =>
  new Date(month + "-01T12:00:00Z").toLocaleDateString("en-GB", { month: short ? "short" : "long", year: short ? "2-digit" : "numeric", timeZone: "UTC" });

export async function ItemTab({ itemId, month, sym, tz }: { itemId: string | null; month: string; sym: string; tz: string }) {
  if (!itemId) {
    return (
      <Panel title="Item performance">
        <Empty>Search for an item above to see its month: opening stock, purchases, stock out, closing balance, money spent and purchase price history.</Empty>
      </Panel>
    );
  }
  const d = await itemMonth(itemId, month, tz);
  if (!d) return <Panel title="Item performance"><Empty>That item no longer exists.</Empty></Panel>;
  const { item, current: c, previous: p, prices } = d;
  const u = item.unit;
  const m = (v: string | number) => formatMoney(v, sym);
  const cost = (v: number | string | null) => (v === null ? "—" : `${formatUnitCost(v, sym)} / ${u}`);
  const prevLabel = mLabel(shiftMonth(month, -1));

  const rows: { label: string; key: keyof ItemMonthFigures; kind: "qty" | "money" | "count"; good?: "up" | "down" }[] = [
    { label: "Opening stock", key: "opening", kind: "qty" },
    { label: "Stock in (received)", key: "in_qty", kind: "qty" },
    { label: "Stock out (issued)", key: "out_qty", kind: "qty" },
    { label: "Closing stock", key: "closing", kind: "qty" },
    { label: "Amount spent on purchases", key: "purchase_spend", kind: "money" },
    { label: "Purchases", key: "purchases", kind: "count" },
    { label: "Value of stock issued (weighted average)", key: "out_value", kind: "money" },
    { label: "Stock-out transactions", key: "issues", kind: "count" },
  ];
  const fmtv = (k: "qty" | "money" | "count", v: string | number) => (k === "qty" ? `${formatQty(String(v))} ${u}` : k === "money" ? m(v) : String(v));
  const losses = [
    ["Damaged", c.damage_qty], ["Expired", c.expiry_qty], ["Wastage", c.wastage_qty], ["Stock-count adjustments", c.count_adj], ["Corrections (reversals)", c.corrections],
  ].filter(([, v]) => Number(v) !== 0) as [string, string][];

  return (
    <div className="space-y-4">
      <div className="glass flex flex-col gap-1 rounded-[var(--radius-card)] px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium text-muted">{item.sku}{item.category ? ` · ${item.category}` : ""}{item.archived_at ? " · archived" : ""}</p>
          <h2 className="text-2xl font-semibold tracking-tight">{item.name}</h2>
          <p className="text-sm text-muted">{mLabel(month)} compared with {prevLabel}</p>
        </div>
        <div className="flex gap-4 text-sm sm:text-right">
          <div><p className="text-xs text-muted">Balance now</p><p className="font-semibold">{formatQty(item.quantity)} {u}</p></div>
          <div><p className="text-xs text-muted">Average cost now</p><p className="font-semibold">{cost(item.avg_cost)}</p></div>
          <Link href={`/items/${item.id}`} className="self-end rounded-full bg-white/80 px-4 py-2 text-xs font-semibold ring-1 ring-white transition hover:bg-white">Open item</Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel title="This month vs last month" bodyClass="overflow-x-auto">
          <table className="w-full text-sm" data-testid="item-month">
            <thead><tr className="text-left text-muted"><Th>Figure</Th><Th right>{mLabel(month, true)}</Th><Th right>{mLabel(shiftMonth(month, -1), true)}</Th><Th right>Change</Th></tr></thead>
            <tbody className="divide-y divide-white/80">
              {rows.map((r) => {
                const a = Number(c[r.key]), b = Number(p[r.key]);
                const diff = a - b;
                return (
                  <tr key={r.key} className={r.key === "closing" ? "bg-rose/60 font-semibold" : ""}>
                    <Td>{r.label}</Td>
                    <Td right><strong>{fmtv(r.kind, c[r.key])}</strong></Td>
                    <Td right><span className="text-muted">{fmtv(r.kind, p[r.key])}</span></Td>
                    <Td right>{diff === 0 ? <span className="text-xs text-muted">—</span> : <span className={`text-xs font-semibold ${diff > 0 ? "text-[#2a78d6]" : "text-burgundy"}`}>{diff > 0 ? "+" : "−"}{fmtv(r.kind, String(Math.abs(Math.round(diff * 1e6) / 1e6)))}</span>}</Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="px-4 py-2 text-xs text-muted">Closing = opening + stock in − stock out ± corrections ± stock-count adjustments.</p>
        </Panel>

        <Panel title="Purchase prices this month">
          {prices ? (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <Mini label="Latest" value={cost(prices.latest)} />
                <Mini label="Previous" value={cost(prices.previous)} />
                <Mini label="Change" value={<Change value={prices.change} pct={prices.changePct} fmt={(n) => formatUnitCost(n, sym)} />} />
                <Mini label="Highest" value={cost(prices.high)} />
                <Mini label="Lowest" value={cost(prices.low)} />
                <Mini label="Average (weighted)" value={cost(prices.avgWeighted)} sub={`simple average ${cost(prices.avgSimple)}`} />
              </div>
              <div className="mt-4 space-y-1.5">
                <p className="text-xs font-semibold text-muted">Quantity bought at each price</p>
                {prices.qtyAtPrice.map((q) => (
                  <div key={q.price} className="flex justify-between rounded-xl bg-white/70 px-3 py-1.5 text-sm"><span>{cost(q.price)}</span><span className="text-muted">{formatQty(String(q.qty))} {u} · {q.purchases}×</span></div>
                ))}
              </div>
            </>
          ) : (
            <Empty>No purchases from suppliers this month{Number(c.in_qty) > 0 ? " (stock received was opening stock or a count adjustment)" : ""}, so there is no price history to show.</Empty>
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel title={`Stock balance · last 12 months (${u})`}>
          <LineChart format="qty" unit={u} series={[{ name: "Closing stock", color: "#9c2a45", points: d.trend.map((t) => ({ x: mLabel(t.month, true), y: t.closing })) }]} />
        </Panel>
        <Panel title={`Average purchase price · last 12 months (per ${u})`}>
          <LineChart format="money" symbol={sym} markChanges zeroBase={false} emptyText="No purchases in the last 12 months."
            series={[{ name: "Average price", color: "#2a78d6", points: d.trend.map((t) => ({ x: mLabel(t.month, true), y: t.avg_price })) }]} />
          <p className="mt-1 text-xs text-muted">Weighted by quantity. Red dot = price went up, green = went down. Gaps = no purchase that month.</p>
        </Panel>
      </div>

      <Panel title={`Daily balance in ${mLabel(month)} (${u})`}>
        <LineChart format="qty" unit={u} height={200} series={[{ name: "Balance", color: "#1baf7a", points: d.days.map((x) => ({ x: x.day.slice(8), y: x.balance })) }]} />
      </Panel>

      {losses.length > 0 && (
        <Panel title="Shortages, damage, expiry and adjustments">
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {losses.map(([l, v]) => (
              <li key={l} className="rounded-2xl bg-white/70 px-4 py-3 ring-1 ring-white"><p className="text-xs text-muted">{l}</p><p className="font-semibold">{Number(v) > 0 && !["Damaged", "Expired", "Wastage"].includes(l) ? "+" : ""}{formatQty(v)} {u}</p></li>
            ))}
          </ul>
          {d.counts.length > 0 && (
            <ul className="mt-3 space-y-1.5 text-sm">
              {d.counts.map((x) => (
                <li key={x.id} className="rounded-xl bg-white/60 px-3 py-2">
                  <strong>{x.count_no}</strong> · {formatDateTime(x.counted_at, tz)} · system {formatQty(x.system_qty)}, counted {formatQty(x.counted_qty)} {u}
                  {" "}(<span className={Number(x.difference) < 0 ? "text-bad" : "text-[#2a78d6]"}>{Number(x.difference) > 0 ? "+" : ""}{formatQty(x.difference)}</span>, {m(x.value_difference)}) · {x.status}{x.decided_by ? ` by ${x.decided_by}` : ""}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}

      <Panel title={`Every movement in ${mLabel(month)} (${d.movements.length})`} bodyClass="overflow-x-auto">
        {d.movements.length ? (
          <table className="w-full min-w-[860px] text-sm">
            <thead><tr className="text-left text-muted"><Th>Date</Th><Th>Type</Th><Th right>Quantity</Th><Th right>Cost / {u}</Th><Th right>Value</Th><Th>Supplier / taken by</Th><Th right>Balance after</Th><Th /></tr></thead>
            <tbody className="divide-y divide-white/80">
              {d.movements.map((x) => {
                const label = x.source === "count" ? "Count adjustment" : x.txn_type === "stock_in" ? (x.is_opening ? "Opening stock" : "Stock in") : x.txn_type === "stock_out" ? "Stock out" : "Correction";
                return (
                  <tr key={x.id} className={x.reversed ? "text-muted line-through decoration-1" : ""}>
                    <Td><span className="whitespace-nowrap">{formatDateTime(x.at, tz)}</span><span className="block text-xs text-muted no-underline">{x.txn_no}</span></Td>
                    <Td><span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${x.direction > 0 ? "bg-ok-bg text-ok" : "bg-rose text-burgundy"}`}>{label}</span>
                      {x.reason && x.source !== "count" && <span className="block text-xs text-muted">{reasonLabel(x.reason)}</span>}</Td>
                    <Td right>{x.direction > 0 ? "+" : "−"}{formatQty(x.qty)} {u}<span className="block text-xs text-muted">{x.entered}</span></Td>
                    <Td right>{formatUnitCost(x.unit_cost, sym)}</Td>
                    <Td right>{m(x.value)}</Td>
                    <Td>{x.txn_type === "stock_in" ? x.supplier ?? "—" : x.who ?? "—"}{x.notes && <span className="block text-xs text-muted">{x.notes}</span>}</Td>
                    <Td right>{formatQty(x.balance_after)} {u}</Td>
                    <Td>{x.txn_type !== "reversal" && <ReceiptLink txnId={x.id} txnNo={x.txn_no} />}</Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : <Empty>No movements this month.</Empty>}
      </Panel>
    </div>
  );
}

function Mini({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="rounded-2xl bg-white/70 px-3 py-2.5 ring-1 ring-white">
      <p className="text-[11px] text-muted">{label}</p>
      <div className="mt-0.5 text-sm font-semibold">{value}</div>
      {sub && <p className="text-[11px] text-muted">{sub}</p>}
    </div>
  );
}
