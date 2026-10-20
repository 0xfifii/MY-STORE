import Link from "next/link";
import { AlertTriangle, ArrowDownToLine, BadgePercent, ClipboardCheck, FileSpreadsheet, FileText, Mail, Package, TrendingDown, TrendingUp } from "@/components/hand-icons";
import { Panel } from "@/components/ui/primitives";
import { PieChart } from "@/components/pie-chart";
import { auditSummary, distribution, unitsInStock, type DistBy, type DistMode } from "@/lib/audit-analytics";
import { moneySlices } from "@/lib/analytics";
import { formatMoney, formatQty } from "@/lib/format";
import type { Period } from "./period";
import { Empty, Seg, ShareBar, StatCard, Td, Th } from "./ui";

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

const MODES: [DistMode, string][] = [["value", "Stock value"], ["quantity", "Stock quantity"], ["in", "Stock in"], ["out", "Stock out"]];

export async function OverviewTab({ period, sym, tz, mode, by, unit, link, canMail }: {
  period: Period; sym: string; tz: string; mode: DistMode; by: DistBy; unit: string | null; link: (p: Record<string, string | null>) => string; canMail: boolean;
}) {
  const r = { from: period.from, to: period.to, tz };
  const units = await unitsInStock();
  const qUnit = unit && units.some((u) => u.unit === unit) ? unit : units[0]?.unit ?? null;
  const [sm, rows] = await Promise.all([auditSummary(r), distribution(mode, by, r, qUnit)]);
  const m = (v: string | number) => formatMoney(v, sym);
  const total = rows.reduce((a, x) => a + Number(x.value), 0);
  const isQty = mode === "quantity";
  const month = period.from.slice(0, 7);
  const qtyList = (u: { unit: string; qty: string }[]) => (u.length ? u.slice(0, 3).map((x) => `${formatQty(x.qty)} ${x.unit}`).join(" · ") + (u.length > 3 ? " …" : "") : "nothing");
  const sliceHref = (key: string, catId: number | null) =>
    by === "item" ? link({ tab: "item", item: key, month, mode: null, by: null, unit: null }) : `/inventory${catId ? `?category=${catId}` : ""}`;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total inventory value" value={m(sm.inventory.value)} sub={`${sm.inventory.items} items in store (now)`} href="/inventory?sort=value" tone="burgundy" icon={<Package className="size-4" />} />
        <StatCard label="Purchases (stock in)" value={m(sm.stockIn.spend)} sub={`${sm.stockIn.receipts} receipts · ${qtyList(sm.stockIn.byUnit)}`} href={link({ tab: "purchases" })} tone="blue" icon={<ArrowDownToLine className="size-4" />} />
        <StatCard label="Stock out (est. value)" value={m(sm.stockOut.value)} sub={`${sm.stockOut.issues} issues · ${qtyList(sm.stockOut.byUnit)}`} href={link({ tab: "stockout" })} tone="rose" icon={<BadgePercent className="size-4 text-burgundy" />} />
        <StatCard label="Low or out of stock" value={plural(sm.inventory.low + sm.inventory.out, "item")} sub={`${sm.inventory.low} low · ${sm.inventory.out} out (now)`} href="/low-stock" tone="amber" icon={<AlertTriangle className="size-4 text-warn" />} />
        <StatCard label="Price increases" value={plural(sm.priceUp, "item")} sub="latest vs previous purchase" href={link({ tab: "prices", dir: "up" })} tone="plain" icon={<TrendingUp className="size-4 text-bad" />} />
        <StatCard label="Price decreases" value={plural(sm.priceDown, "item")} sub="latest vs previous purchase" href={link({ tab: "prices", dir: "down" })} tone="green" icon={<TrendingDown className="size-4 text-ok" />} />
        <StatCard label="Count shortages" value={m(sm.counts.shortage)} sub={`${sm.counts.shortages} approved · ${sm.counts.pending} pending`} href="/stock-count" tone="plain" icon={<ClipboardCheck className="size-4 text-bad" />} />
        <StatCard label="Count excesses" value={m(sm.counts.excess)} sub={`${sm.counts.excesses} approved counts`} href="/stock-count" tone="plain" icon={<ClipboardCheck className="size-4 text-[#2a78d6]" />} />
      </div>

      <Panel
        title={<span>Inventory distribution <span className="font-normal text-muted">· {mode === "value" || mode === "quantity" ? "right now" : period.label}</span></span>}
        actions={<Seg options={[["item", "Items"], ["category", "Categories"]]} value={by} href={(v) => link({ by: v === "item" ? null : v })} />}
      >
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <Seg options={MODES} value={mode} href={(v) => link({ mode: v === "value" ? null : v })} />
          {isQty && units.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-muted">Unit:</span>
              {units.map((u) => (
                <Link key={u.unit} href={link({ unit: u.unit })} scroll={false}
                  className={`rounded-full px-3 py-1 font-semibold ring-1 transition active:scale-95 ${qUnit === u.unit ? "bg-burgundy text-white ring-burgundy" : "bg-white/80 ring-white hover:bg-rose"}`}>
                  {u.unit} <span className="opacity-70">({u.items})</span>
                </Link>
              ))}
            </div>
          )}
        </div>
        {isQty && <p className="-mt-3 mb-4 text-xs text-muted">Quantities can only be compared between items counted in the same unit, so pick a unit.</p>}
        {rows.length ? (
          <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <PieChart
              big
              size={380}
              slices={moneySlices(rows.map((x) => ({
                label: x.label,
                value: x.value,
                href: sliceHref(x.key, x.category_id),
                detail: isQty ? `${formatQty(x.value)} ${qUnit}` : `${m(x.value)}${x.qty && x.unit ? ` · ${formatQty(x.qty)} ${x.unit}` : ""}${mode === "in" || mode === "out" ? ` · ${x.count}×` : ""}`,
              })), sym)}
              centerLabel={MODES.find((x) => x[0] === mode)![1]}
              centerValue={isQty ? `${formatQty(String(total))} ${qUnit}` : m(total).replace(/\.00$/, "")}
              emptyText=""
            />
            <div className="max-h-[440px] overflow-auto rounded-3xl bg-white/50 ring-1 ring-white">
              <table className="w-full text-sm" data-testid="distribution-table">
                <thead className="sticky top-0 z-[1] backdrop-blur"><tr className="text-left text-muted">
                  <Th>{by === "item" ? "Item" : "Category"}</Th><Th right>{isQty ? `Quantity (${qUnit})` : "Value"}</Th><Th>Share</Th>
                </tr></thead>
                <tbody className="divide-y divide-white/80">
                  {rows.map((x) => (
                    <tr key={x.key} className="transition-colors hover:bg-white/70">
                      <Td>
                        <Link href={sliceHref(x.key, x.category_id)} className="font-semibold hover:text-burgundy">{x.label}</Link>
                        {!isQty && x.qty && x.unit && <span className="block text-xs text-muted">{formatQty(x.qty)} {x.unit}{mode === "in" || mode === "out" ? ` · ${x.count} transactions` : ""}</span>}
                      </Td>
                      <Td right>{isQty ? formatQty(x.value) : m(x.value)}</Td>
                      <Td><ShareBar pct={total ? (Number(x.value) / total) * 100 : 0} /></Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <Empty>{mode === "in" ? "No stock received in this period." : mode === "out" ? "No stock issued in this period." : "Nothing in stock."}</Empty>
        )}
        <p className="mt-4 text-xs text-muted">
          Click a slice or a row to open it. Values use weighted-average cost; stock in includes opening stock but not stock-count adjustments; stock out leaves out reversed entries and count shortages.
        </p>
      </Panel>

      <Panel title={`Monthly audit report · ${new Date(month + "-01T12:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })}`}>
        <p className="text-sm text-muted">
          Opening and closing balances, purchases, most purchased and highest-spending items, price changes, the 12-month trend, stock-count
          discrepancies and approvals, low stock and damaged or expired stock, with the generation date and who prepared it.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <a href={`/api/audit/export?month=${month}&format=pdf`} className="inline-flex h-11 items-center gap-2 rounded-full bg-burgundy px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-burgundy-hover active:scale-95"><FileText className="size-4" /> Download PDF</a>
          <a href={`/api/audit/export?month=${month}&format=xlsx`} className="inline-flex h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-semibold ring-1 ring-white transition hover:bg-rose active:scale-95"><FileSpreadsheet className="size-4" /> Download Excel</a>
          {canMail && <Link href="/mail" className="inline-flex h-11 items-center gap-2 rounded-full bg-white/70 px-5 text-sm font-semibold ring-1 ring-white transition hover:bg-white active:scale-95"><Mail className="size-4" /> Email it</Link>}
        </div>
      </Panel>
    </div>
  );
}
