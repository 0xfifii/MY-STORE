import Link from "next/link";
import { Panel } from "@/components/ui/primitives";
import { LineChart } from "@/components/line-chart";
import { ListFilters } from "@/components/list-filters";
import { UrlSelect } from "@/components/url-select";
import { dailyPurchases, priceTracking, purchaseRanking, reasonTotals, stockOutAnalysis } from "@/lib/audit-analytics";
import { formatDate, formatMoney, formatQty, formatUnitCost, reasonLabel } from "@/lib/format";
import type { Period } from "./period";
import { Change, Empty, Seg, ShareBar, Td, Th } from "./ui";

type Link_ = (p: Record<string, string | null>) => string;
type R = { from: string; to: string; tz: string };

function Callout({ label, title, sub, tone = "white" }: { label: string; title: string; sub: string; tone?: "night" | "white" | "blue" | "rose" }) {
  const cls = { night: "bg-night text-white", white: "bg-white/80 ring-1 ring-white", blue: "bg-[#6b6b6b] text-white", rose: "bg-rose ring-1 ring-white" }[tone];
  return (
    <div className={`rounded-3xl p-4 transition-transform duration-200 hover:-translate-y-0.5 ${cls}`}>
      <p className="text-xs opacity-75">{label}</p>
      <p className="mt-1 truncate text-lg font-semibold">{title}</p>
      <p className="truncate text-sm opacity-80">{sub}</p>
    </div>
  );
}

// ------------------------------------------------------------------------------------------- Purchases
export async function PurchasesTab({ r, period, sym, sort, link, ditem }: { r: R; period: Period; sym: string; sort: string; link: Link_; ditem: string | null }) {
  const [rows, allDaily] = await Promise.all([purchaseRanking(r), dailyPurchases(r, null)]);
  const m = (v: string | number) => formatMoney(v, sym);
  const daily = ditem ? allDaily.filter((x) => x.item_id === ditem) : allDaily;
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
      <DailySpending daily={daily} allDaily={allDaily} period={period} sym={sym} ditem={ditem} link={link} />
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
                  <Td><ShareBar pct={(Number(x.spend) / (spent || 1)) * 100} color="bg-[#6b6b6b]" /></Td>
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

// ------------------------------------------------------------------------------------------- Daily spending
type Daily = Awaited<ReturnType<typeof dailyPurchases>>;
const dayLabel = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

function DailySpending({ daily, allDaily, period, sym, ditem, link }: { daily: Daily; allDaily: Daily; period: Period; sym: string; ditem: string | null; link: Link_ }) {
  const m = (v: string | number) => formatMoney(v, sym);
  const sum = (xs: Daily) => xs.reduce((a, x) => a + Number(x.amount), 0);
  const bought = daily.filter((x) => !x.opening);
  const opening = daily.filter((x) => x.opening);
  const total = sum(daily);
  const days = [...new Set(daily.map((x) => x.day))];
  const buyDays = new Set(bought.map((x) => x.day)).size;
  const items = new Map<string, string>();
  for (const x of allDaily) items.set(x.item_id, x.name);
  const itemName = ditem ? items.get(ditem) : null;
  const byUnit = new Map<string, number>();
  for (const x of daily) byUnit.set(x.unit, (byUnit.get(x.unit) ?? 0) + Number(x.qty));

  // one point per calendar day in the period, so quiet days show as zero
  const chart: { x: string; y: number }[] = [];
  if (period.from !== period.to) {
    const per = new Map<string, number>();
    for (const x of daily) per.set(x.day, (per.get(x.day) ?? 0) + Number(x.amount));
    for (let d = period.from; d <= period.to && chart.length < 400; ) {
      chart.push({ x: new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }), y: per.get(d) ?? 0 });
      const n = new Date(d + "T12:00:00Z"); n.setUTCDate(n.getUTCDate() + 1); d = n.toISOString().slice(0, 10);
    }
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" data-testid="stockin-worth">
        <div className="rounded-3xl bg-gradient-to-br from-burgundy to-claret p-4 text-paper shadow-[0_14px_30px_-18px_rgb(0_0_0/0.9)]">
          <p className="text-xs opacity-80">Total stock-in worth{itemName ? ` · ${itemName}` : ""}</p>
          <p className="mt-1 text-2xl font-bold tracking-tight tabular-nums">{m(total)}</p>
          <p className="text-sm opacity-80">quantity received × unit price · {period.label}</p>
        </div>
        <Callout label="Bought from suppliers" title={m(sum(bought))} sub={`${bought.reduce((a, x) => a + x.entries, 0)} stock-in entries`} />
        <Callout label="Opening stock entered" title={m(sum(opening))} sub={opening.length ? `${opening.length} item${opening.length === 1 ? "" : "s"} set up with stock` : "none in this period"} />
        <Callout tone="rose" label="Average spent per buying day" title={m(buyDays ? sum(bought) / buyDays : 0)} sub={`${buyDays} day${buyDays === 1 ? "" : "s"} with purchases · ${[...byUnit].map(([u, q]) => `${formatQty(String(q))} ${u}`).slice(0, 3).join(" · ") || "nothing received"}`} />
      </div>

      <Panel
        title={<span>Daily spending per item <span className="font-normal text-muted">· {period.label}</span></span>}
        actions={<UrlSelect name="ditem" label="Show one item" allLabel="All items" options={[...items].sort((a, b) => a[1].localeCompare(b[1])).map(([value, label]) => ({ value, label }))} />}
      >
        {chart.length > 1 && daily.length > 0 && (
          <div className="mb-5">
            <LineChart format="money" symbol={sym} height={200} series={[{ name: itemName ? `Spent on ${itemName}` : "Spent per day", color: "#111111", points: chart }]} />
          </div>
        )}
        {days.length ? (
          <div className="space-y-4" data-testid="daily-spending">
            {days.map((d) => {
              const rowsOfDay = daily.filter((x) => x.day === d);
              return (
                <section key={d} className="overflow-hidden rounded-2xl bg-paper ring-1 ring-burgundy/12">
                  <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-burgundy/10 bg-burgundy/[0.04] px-4 py-2.5">
                    <h3 className="font-semibold">{dayLabel(d)}</h3>
                    <p className="text-sm text-muted">{rowsOfDay.length} item{rowsOfDay.length === 1 ? "" : "s"} · <strong className="text-base text-burgundy tabular-nums">{m(sum(rowsOfDay))}</strong></p>
                  </header>
                  <ul className="divide-y divide-burgundy/8 sm:hidden">
                    {rowsOfDay.map((x) => (
                      <li key={x.item_id + String(x.opening)} className="px-4 py-3">
                        <div className="flex items-baseline justify-between gap-3">
                          <Link href={link({ tab: "item", item: x.item_id, month: d.slice(0, 7) })} className="min-w-0 truncate font-semibold">{x.name}</Link>
                          <strong className="shrink-0 tabular-nums text-burgundy">{m(x.amount)}</strong>
                        </div>
                        <p className="mt-0.5 text-sm tabular-nums text-ink/80">{formatQty(x.qty)} {x.unit} × {formatUnitCost(x.unit_price, sym)}{x.prices > 1 ? " avg" : ""}</p>
                        <p className="text-xs text-muted">{x.sku}{x.opening ? " · opening stock" : ""}{x.suppliers ? ` · ${x.suppliers}` : ""}</p>
                      </li>
                    ))}
                  </ul>
                  <div className="hidden overflow-x-auto sm:block">
                    <table className="w-full min-w-[640px] text-sm">
                      <thead><tr className="text-left text-muted"><Th>Item</Th><Th right>Quantity</Th><Th right>Unit price</Th><Th right>Amount</Th><Th>Supplier</Th></tr></thead>
                      <tbody className="divide-y divide-burgundy/8">
                        {rowsOfDay.map((x) => (
                          <tr key={x.item_id + String(x.opening)} className="transition-colors hover:bg-burgundy/[0.03]">
                            <Td>
                              <Link href={link({ tab: "item", item: x.item_id, month: d.slice(0, 7) })} className="font-semibold hover:text-burgundy">{x.name}</Link>
                              <span className="block text-xs text-muted">{x.sku}{x.opening ? " · opening stock" : ""}{x.entries > 1 ? ` · ${x.entries} entries` : ""}</span>
                            </Td>
                            <Td right><span className="tabular-nums">{formatQty(x.qty)}</span> {x.unit}</Td>
                            <Td right><span className="tabular-nums">{formatUnitCost(x.unit_price, sym)}</span><span className="block text-xs text-muted">each {x.unit}{x.prices > 1 ? " (average)" : ""}</span></Td>
                            <Td right><strong className="tabular-nums">{m(x.amount)}</strong></Td>
                            <Td><span className="text-xs text-muted">{x.suppliers ?? "-"}</span></Td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              );
            })}
          </div>
        ) : <Empty>{itemName ? `No ${itemName} was received in this period.` : "Nothing was received into the store in this period."}</Empty>}
        <p className="mt-4 text-xs text-muted">Amount = quantity received × unit price. Where an item was bought more than once in a day at different prices, the unit price shown is the average. Reversed entries and stock-count adjustments are left out.</p>
      </Panel>
    </>
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
                          <div className="flex items-center gap-1.5"><div className="h-1.5 rounded-full bg-[#6b6b6b]" style={{ width: `${(Number(x.in_qty) / mx) * 100}%`, minWidth: Number(x.in_qty) ? 3 : 0 }} /><span className="text-muted">in {formatQty(x.in_qty)}</span></div>
                          <div className="flex items-center gap-1.5"><div className="h-1.5 rounded-full bg-[#111111]" style={{ width: `${(Number(x.out_qty) / mx) * 100}%`, minWidth: 3 }} /><span className="text-muted">out {formatQty(x.out_qty)}</span></div>
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
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full bg-gradient-to-r from-[#111111] to-[#444444]" style={{ width: `${(Number(x.value) / (reasonTotal || 1)) * 100}%` }} /></div>
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
                series={[{ name: "Price", color: "#111111", points: sel.points.map((p) => ({ x: formatDate(p.day).replace(/ \d{4}$/, ""), y: p.price, note: `${formatQty(String(p.qty))} ${sel.unit}${p.supplier ? ` · ${p.supplier}` : ""}` })) }]} />
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
