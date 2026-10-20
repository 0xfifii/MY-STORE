import Link from "next/link";
import { Panel } from "@/components/ui/primitives";
import { LineChart } from "@/components/line-chart";
import { ListFilters } from "@/components/list-filters";
import { priceTracking, purchaseRanking, reasonTotals, stockOutAnalysis } from "@/lib/audit-analytics";
import { formatDate, formatMoney, formatQty, formatUnitCost, reasonLabel } from "@/lib/format";
import type { Period } from "./period";
import { Change, Empty, Seg, ShareBar, Td, Th } from "./ui";

type Link_ = (p: Record<string, string | null>) => string;
type R = { from: string; to: string; tz: string };

function Callout({ label, title, sub, tone = "white" }: { label: string; title: string; sub: string; tone?: "night" | "white" | "blue" | "rose" }) {
  const cls = { night: "bg-night text-white", white: "bg-white/80 ring-1 ring-white", blue: "bg-[#2a78d6] text-white", rose: "bg-rose ring-1 ring-white" }[tone];
  return (
    <div className={`rounded-3xl p-4 transition-transform duration-200 hover:-translate-y-0.5 ${cls}`}>
      <p className="text-xs opacity-75">{label}</p>
      <p className="mt-1 truncate text-lg font-semibold">{title}</p>
      <p className="truncate text-sm opacity-80">{sub}</p>
    </div>
  );
}

// ------------------------------------------------------------------------------------------- Purchases
export async function PurchasesTab({ r, period, sym, sort, link }: { r: R; period: Period; sym: string; sort: string; link: Link_ }) {
  const rows = await purchaseRanking(r);
  const m = (v: string | number) => formatMoney(v, sym);
  const spent = rows.reduce((a, x) => a + Number(x.spend), 0);
  const sorted = [...rows].sort((a, b) =>
    sort === "qty" ? a.unit.localeCompare(b.unit) || Number(b.qty) - Number(a.qty)
    : sort === "count" ? b.purchases - a.purchases || Number(b.spend) - Number(a.spend)
    : sort === "restock" ? b.restock_days - a.restock_days || b.purchases - a.purchases
    : Number(b.spend) - Number(a.spend));
  const topSpend = rows[0];
  const byCount = [...rows].sort((a, b) => b.purchases - a.purchases)[0];
  const byRestock = [...rows].sort((a, b) => b.restock_days - a.restock_days)[0];
  const largestPerUnit = new Map<string, (typeof rows)[number]>();
  for (const x of rows) if (!largestPerUnit.has(x.unit) || Number(x.qty) > Number(largestPerUnit.get(x.unit)!.qty)) largestPerUnit.set(x.unit, x);
  const qtyLeader = [...largestPerUnit.values()].sort((a, b) => Number(b.qty) - Number(a.qty));

  return (
    <div className="space-y-4">
      {rows.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Callout tone="night" label="Cost the most money" title={topSpend.name} sub={`${m(topSpend.spend)} · ${((Number(topSpend.spend) / (spent || 1)) * 100).toFixed(0)}% of all spending`} />
          <Callout tone="blue" label="Largest quantity bought" title={`${qtyLeader[0].name}`} sub={qtyLeader.map((x) => `${formatQty(x.qty)} ${x.unit}`).slice(0, 1).join("") + (qtyLeader.length > 1 ? ` (top in ${qtyLeader[0].unit})` : "")} />
          <Callout label="Most purchase transactions" title={byCount.name} sub={`${byCount.purchases} purchases`} />
          <Callout tone="rose" label="Most frequently restocked" title={byRestock.name} sub={`restocked on ${byRestock.restock_days} different day${byRestock.restock_days === 1 ? "" : "s"}`} />
        </div>
      )}
      {qtyLeader.length > 1 && (
        <p className="text-xs text-muted">Largest quantity per unit: {qtyLeader.map((x) => `${x.name} ${formatQty(x.qty)} ${x.unit}`).join(" · ")}. Quantities in different units can&apos;t be compared, so money is used for the overall ranking.</p>
      )}
      <Panel
        title={<span>Most purchased items <span className="font-normal text-muted">· {period.label}</span></span>}
        actions={<Seg options={[["spend", "Money spent"], ["qty", "Quantity"], ["count", "Purchases"], ["restock", "Restocked"]]} value={sort} href={(v) => link({ sort: v === "spend" ? null : v })} />}
        bodyClass="overflow-x-auto"
      >
        {rows.length ? (
          <table className="w-full min-w-[900px] text-sm" data-testid="purchases-table">
            <thead><tr className="text-left text-muted">
              <Th>#</Th><Th>Item</Th><Th right>Quantity bought</Th><Th right>Purchases</Th><Th right>Days restocked</Th><Th right>Average price (weighted)</Th><Th right>Total spent</Th><Th>Share of spending</Th><Th>Last bought</Th>
            </tr></thead>
            <tbody className="divide-y divide-white/80">
              {sorted.map((x, i) => (
                <tr key={x.item_id} className="transition-colors hover:bg-white/60">
                  <Td>{i + 1}</Td>
                  <Td><Link href={link({ tab: "item", item: x.item_id, month: r.to.slice(0, 7) })} className="font-semibold hover:text-burgundy">{x.name}</Link><span className="block text-xs text-muted">{x.category ?? "Uncategorised"}</span></Td>
                  <Td right><strong>{formatQty(x.qty)}</strong> {x.unit}</Td>
                  <Td right>{x.purchases}</Td>
                  <Td right>{x.restock_days}</Td>
                  <Td right>{formatUnitCost(x.avg_price, sym)} / {x.unit}</Td>
                  <Td right><strong>{m(x.spend)}</strong></Td>
                  <Td><ShareBar pct={(Number(x.spend) / (spent || 1)) * 100} color="bg-[#2a78d6]" /></Td>
                  <Td><span className="whitespace-nowrap text-xs text-muted">{formatDate(x.last_day)}</span></Td>
                </tr>
              ))}
              <tr className="bg-white/50 font-semibold"><Td /><Td>Total</Td><Td /><Td right>{rows.reduce((a, x) => a + x.purchases, 0)}</Td><Td /><Td /><Td right>{m(spent)}</Td><Td /><Td /></tr>
            </tbody>
          </table>
        ) : <Empty>No purchases from suppliers in this period.</Empty>}
      </Panel>
      <p className="text-xs text-muted">Purchases are stock-in entries from suppliers. Opening stock, stock-count excesses and reversed entries are left out. Average price = amount spent ÷ quantity, per base unit.</p>
    </div>
  );
}

// ------------------------------------------------------------------------------------------- Stock out
export async function StockOutTab({ r, period, sym, sort, link }: { r: R; period: Period; sym: string; sort: string; link: Link_ }) {
  const [rows, reasons] = await Promise.all([stockOutAnalysis(r), reasonTotals(r)]);
  const m = (v: string | number) => formatMoney(v, sym);
  const totalValue = rows.reduce((a, x) => a + Number(x.out_value), 0);
  const sorted = [...rows].sort((a, b) =>
    sort === "value" ? Number(b.out_value) - Number(a.out_value)
    : sort === "qty" ? a.unit.localeCompare(b.unit) || Number(b.out_qty) - Number(a.out_qty)
    : sort === "turnover" ? Number(b.turnover ?? 0) - Number(a.turnover ?? 0)
    : b.issues - a.issues || Number(b.out_value) - Number(a.out_value));
  const fastest = [...rows].sort((a, b) => b.issues - a.issues)[0];
  const priciest = [...rows].sort((a, b) => Number(b.out_value) - Number(a.out_value))[0];
  const turnover = [...rows].sort((a, b) => Number(b.turnover ?? 0) - Number(a.turnover ?? 0))[0];
  const reasonTotal = reasons.reduce((a, x) => a + Number(x.value), 0);

  return (
    <div className="space-y-4">
      {rows.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Callout tone="night" label="Issued most often" title={fastest.name} sub={`${fastest.issues} stock outs · ${formatQty(fastest.out_qty)} ${fastest.unit}`} />
          <Callout tone="rose" label="Highest value issued" title={priciest.name} sub={`${m(priciest.out_value)} · ${((Number(priciest.out_value) / (totalValue || 1)) * 100).toFixed(0)}% of value issued`} />
          <Callout label="Fastest moving (share of available stock used)" title={turnover.name} sub={turnover.turnover ? `${turnover.turnover}% of what was available went out` : "-"} />
        </div>
      )}
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <Panel
          title={<span>Stock out by item <span className="font-normal text-muted">· {period.label}</span></span>}
          actions={<Seg options={[["issues", "Most frequent"], ["value", "Value"], ["qty", "Quantity"], ["turnover", "Fastest moving"]]} value={sort} href={(v) => link({ sort: v === "issues" ? null : v })} />}
          bodyClass="overflow-x-auto"
        >
          {rows.length ? (
            <table className="w-full min-w-[820px] text-sm" data-testid="stockout-table">
              <thead><tr className="text-left text-muted"><Th>#</Th><Th>Item</Th><Th right>Qty out</Th><Th right>Times</Th><Th right>Est. value</Th><Th>Stock in vs out</Th><Th right>Used of available</Th><Th>Recorded reasons</Th></tr></thead>
              <tbody className="divide-y divide-white/80">
                {sorted.map((x, i) => {
                  const mx = Math.max(Number(x.in_qty), Number(x.out_qty), 1e-9);
                  return (
                    <tr key={x.item_id} className="transition-colors hover:bg-white/60">
                      <Td>{i + 1}</Td>
                      <Td><Link href={link({ tab: "item", item: x.item_id, month: r.to.slice(0, 7) })} className="font-semibold hover:text-burgundy">{x.name}</Link><span className="block text-xs text-muted">{x.category ?? "Uncategorised"}</span></Td>
                      <Td right><strong>{formatQty(x.out_qty)}</strong> {x.unit}</Td>
                      <Td right>{x.issues}</Td>
                      <Td right>{m(x.out_value)}</Td>
                      <Td>
                        <div className="w-36 space-y-1 text-[11px]">
                          <div className="flex items-center gap-1.5"><div className="h-1.5 rounded-full bg-[#2a78d6]" style={{ width: `${(Number(x.in_qty) / mx) * 100}%`, minWidth: Number(x.in_qty) ? 3 : 0 }} /><span className="text-muted">in {formatQty(x.in_qty)}</span></div>
                          <div className="flex items-center gap-1.5"><div className="h-1.5 rounded-full bg-[#b3141f]" style={{ width: `${(Number(x.out_qty) / mx) * 100}%`, minWidth: 3 }} /><span className="text-muted">out {formatQty(x.out_qty)}</span></div>
                        </div>
                      </Td>
                      <Td right>{x.turnover ? `${x.turnover}%` : "-"}</Td>
                      <Td><div className="flex flex-wrap gap-1">{x.reasons.map((y) => <span key={y.reason} className="rounded-full bg-white px-2 py-0.5 text-[11px] ring-1 ring-line">{reasonLabel(y.reason)} {y.count}×</span>)}</div></Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : <Empty>No stock was issued in this period.</Empty>}
        </Panel>
        <Panel title="Why stock went out">
          {reasons.length ? (
            <ul className="space-y-3">
              {reasons.map((x) => (
                <li key={x.reason}>
                  <div className="flex justify-between text-sm"><span className="font-medium">{reasonLabel(x.reason)}</span><span className="text-muted">{x.count}× · <strong className="text-ink">{m(x.value)}</strong></span></div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full bg-gradient-to-r from-[#b3141f] to-[#d9443a]" style={{ width: `${(Number(x.value) / (reasonTotal || 1)) * 100}%` }} /></div>
                </li>
              ))}
            </ul>
          ) : <Empty>Nothing issued.</Empty>}
          <p className="mt-4 text-xs text-muted">Reasons are exactly as recorded on each stock out. Only &quot;Sale&quot; means the stock was sold; the rest are usage, transfers or losses.</p>
        </Panel>
      </div>
      <p className="text-xs text-muted">Value = weighted-average cost at the time of each stock out. &quot;Used of available&quot; = quantity issued ÷ (opening stock + stock received) in the period. Reversed entries and stock-count shortages are left out.</p>
    </div>
  );
}

// ------------------------------------------------------------------------------------------- Prices
export async function PricesTab({ r, period, sym, q, dir, pitem, link }: { r: R; period: Period; sym: string; q: string | null; dir: string; pitem: string | null; link: Link_ }) {
  const all = await priceTracking(r, q);
  const rows = all.filter((x) => (dir === "up" ? (x.change ?? 0) > 0 : dir === "down" ? (x.change ?? 0) < 0 : true));
  const sel = rows.find((x) => x.item_id === pitem) ?? rows.find((x) => x.points.length > 1) ?? rows[0];
  const c = (v: number | null, u: string) => (v === null ? "-" : `${formatUnitCost(v, sym)}`) + (v === null ? "" : ` / ${u}`);
  const ups = all.filter((x) => (x.change ?? 0) > 0).length;
  const downs = all.filter((x) => (x.change ?? 0) < 0).length;

  return (
    <div className="space-y-4">
      <ListFilters searchPlaceholder="Search an item or category for its price history" selects={[]} />
      <div className="flex flex-wrap items-center gap-2">
        <Seg options={[["all", `All items (${all.length})`], ["up", `Price went up (${ups})`], ["down", `Price went down (${downs})`]]} value={dir} href={(v) => link({ dir: v === "all" ? null : v, pitem: null })} />
      </div>

      {sel ? (
        <Panel title={<span>{sel.name}: purchase price per {sel.unit} <span className="font-normal text-muted">· {period.label}</span></span>}>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <div>
              <LineChart format="money" symbol={sym} markChanges zeroBase={false}
                series={[{ name: "Price", color: "#b3141f", points: sel.points.map((p) => ({ x: formatDate(p.day).replace(/ \d{4}$/, ""), y: p.price, note: `${formatQty(String(p.qty))} ${sel.unit}${p.supplier ? ` · ${p.supplier}` : ""}` })) }]} />
              {sel.points.length === 1 && <p className="mt-2 text-xs text-muted">Only one purchase in this period{sel.historyBefore ? ` (plus ${sel.historyBefore} earlier)` : ""}. Pick a longer period to see a trend.</p>}
            </div>
            <div className="space-y-2 text-sm">
              <Row l="Previous purchase price" v={c(sel.previous, sel.unit)} />
              <Row l="Latest purchase price" v={c(sel.latest, sel.unit)} strong />
              <div className="flex items-center justify-between rounded-xl bg-white/70 px-3 py-2"><span className="text-muted">Change</span><Change value={sel.change} pct={sel.changePct} fmt={(n) => formatUnitCost(n, sym)} /></div>
              <Row l="Highest / lowest" v={`${c(sel.high, sel.unit)} · ${c(sel.low, sel.unit)}`} />
              <Row l="Average (weighted by quantity)" v={c(sel.avgWeighted, sel.unit)} />
              <Row l="Average (simple, unweighted)" v={c(sel.avgSimple, sel.unit)} />
              <Row l="Bought this period" v={`${formatQty(String(sel.qty))} ${sel.unit} · ${formatMoney(sel.spend, sym)}`} />
              <Row l="Suppliers" v={sel.suppliers.join(", ") || "Not recorded"} />
            </div>
          </div>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead><tr className="text-left text-muted"><Th>Date</Th><Th right>Price / {sel.unit}</Th><Th>vs previous</Th><Th right>Quantity</Th><Th right>Amount</Th><Th>As entered</Th><Th>Supplier</Th></tr></thead>
              <tbody className="divide-y divide-white/80">
                {sel.points.map((p, i) => {
                  const before = i > 0 ? sel.points[i - 1].price : sel.historyBefore ? sel.previous : null;
                  const ch = before === null || (i === 0 && sel.points.length > 1 && !sel.historyBefore) ? null : Math.round((p.price - before) * 10000) / 10000;
                  return (
                    <tr key={p.id}>
                      <Td><span className="whitespace-nowrap">{formatDate(p.day)}</span></Td>
                      <Td right><strong>{formatUnitCost(p.price, sym)}</strong></Td>
                      <Td>{i === 0 && !sel.historyBefore ? <span className="text-xs text-muted">first</span> : <Change value={ch} pct={ch !== null && before ? (ch / before) * 100 : null} fmt={(n) => formatUnitCost(n, sym)} />}</Td>
                      <Td right>{formatQty(String(p.qty))} {sel.unit}</Td>
                      <Td right>{formatMoney(p.spend, sym)}</Td>
                      <Td><span className="text-xs text-muted">{p.entered}</span></Td>
                      <Td>{p.supplier ?? "-"}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : null}

      <Panel title="Price changes by item" bodyClass="overflow-x-auto">
        {rows.length ? (
          <table className="w-full min-w-[1000px] text-sm" data-testid="prices-table">
            <thead><tr className="text-left text-muted">
              <Th>Item</Th><Th right>Previous</Th><Th right>Latest</Th><Th>Change</Th><Th right>Highest</Th><Th right>Lowest</Th><Th right>Avg (weighted)</Th><Th>Quantity at each price</Th><Th right>Spent</Th><Th>Suppliers</Th>
            </tr></thead>
            <tbody className="divide-y divide-white/80">
              {rows.map((x) => (
                <tr key={x.item_id} className={`transition-colors hover:bg-white/60 ${sel?.item_id === x.item_id ? "bg-rose/60" : ""}`}>
                  <Td><Link href={link({ pitem: x.item_id })} scroll={false} className="font-semibold hover:text-burgundy">{x.name}</Link><span className="block text-xs text-muted">per {x.unit} · {x.points.length} purchase{x.points.length === 1 ? "" : "s"}</span></Td>
                  <Td right>{x.previous === null ? "-" : formatUnitCost(x.previous, sym)}</Td>
                  <Td right><strong>{x.latest === null ? "-" : formatUnitCost(x.latest, sym)}</strong></Td>
                  <Td><Change value={x.change} pct={x.changePct} fmt={(n) => formatUnitCost(n, sym)} /></Td>
                  <Td right>{x.high === null ? "-" : formatUnitCost(x.high, sym)}</Td>
                  <Td right>{x.low === null ? "-" : formatUnitCost(x.low, sym)}</Td>
                  <Td right>{x.avgWeighted === null ? "-" : formatUnitCost(x.avgWeighted, sym)}</Td>
                  <Td><span className="text-xs text-muted">{x.qtyAtPrice.map((p) => `${formatQty(String(p.qty))} @ ${formatUnitCost(p.price, sym)}`).join(" · ")}</span></Td>
                  <Td right>{formatMoney(x.spend, sym)}</Td>
                  <Td><span className="text-xs">{x.suppliers.join(", ") || "-"}</span></Td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <Empty>{q ? "No purchases match that search in this period." : dir !== "all" ? "No items with that kind of price change in this period." : "No purchases from suppliers in this period, so there is no price history yet."}</Empty>}
      </Panel>
      <p className="text-xs text-muted">
        Prices are per base unit of each item, so different pack sizes compare fairly (e.g. ₦1,800 → ₦2,000 per kg is +₦200, +11.11%). &quot;Previous&quot; is the
        purchase just before the latest one, even if it was in an earlier period. Opening stock and stock-count adjustments aren&apos;t purchases.
      </p>
    </div>
  );
}

function Row({ l, v, strong }: { l: string; v: string; strong?: boolean }) {
  return <div className="flex items-center justify-between gap-3 rounded-xl bg-white/70 px-3 py-2"><span className="text-muted">{l}</span><span className={`text-right ${strong ? "font-semibold" : ""}`}>{v}</span></div>;
}
