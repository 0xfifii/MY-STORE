import Link from "next/link";
import { Panel, PageHeader, StatusBadge } from "@/components/ui/primitives";
import { ReportControls } from "@/components/report-controls";
import { PieChart } from "@/components/pie-chart";
import { requirePageUser } from "@/lib/auth";
import { listCategories } from "@/lib/catalog";
import { query } from "@/lib/db";
import { buildReport, normaliseParams, sectionsFor } from "@/lib/reports/engine";
import { getSettings } from "@/lib/settings";
import { formatDateTime, formatMoney, formatQty, formatUnitCost, reasonLabel } from "@/lib/format";

export const metadata = { title: "Reports" };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requirePageUser("view");
  const raw = await searchParams;
  const s = await getSettings();
  const params = normaliseParams(raw.preset || raw.from || raw.month ? raw : { ...raw, preset: "today" }, s.timezone);
  const [report, categories, items] = await Promise.all([
    buildReport(params, s),
    listCategories(),
    query<{ id: string; name: string; sku: string }>("SELECT id, name, sku FROM items ORDER BY lower(name)"),
  ]);
  const sym = s.currency_symbol;
  const m = (v: string) => formatMoney(v, sym);
  const sec = sectionsFor(params.kind);
  const tz = s.timezone;
  const sm = report.summary;

  return (
    <div>
      <PageHeader title="Reports" description="Daily, weekly or monthly. Pick a period and filters, then view or download."
        actions={<Link href="/reports/history" className="text-sm font-semibold text-burgundy hover:underline">Report History</Link>} />
      <ReportControls
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        items={items}
        resolved={{ from: params.from, to: params.to, kind: params.kind, item: params.itemId ?? null, category: params.categoryId ? String(params.categoryId) : null }}
      />

      <div className="mt-6 glass rounded-[var(--radius-card)]">
        <div className="flex flex-col gap-1 border-b border-white/80 px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xl font-bold text-claret">{s.store_name}</p>
            <h2 className="text-lg font-medium">{report.title}</h2>
          </div>
          <div className="text-sm text-muted sm:text-right">
            <p className="font-semibold text-ink" data-testid="report-period">{report.periodLabel}</p>
            {report.scopeLabel && <p>{report.scopeLabel}</p>}
          </div>
        </div>

        {/* General report: total stock */}
        <div className="grid grid-cols-2 overflow-hidden border-b border-white/80 sm:grid-cols-3 xl:grid-cols-6">
          <Sum label="Total stock value" value={m(sm.closing_value)} sub={`${report.stockStatus.items} items in store`} strong />
          <Sum label="Opening value" value={m(sm.opening_value)} />
          <Sum label="Cost of stock in" value={m(sm.in_value)} sub={`${sm.in_count} receipts`} tone="text-ok" />
          <Sum label="Cost of stock out" value={m(sm.out_value)} sub={`${sm.out_count} issues`} tone="text-burgundy" />
          <Sum label="Net change" value={`${Number(sm.closing_value) - Number(sm.opening_value) >= 0 ? "+" : "−"}${m(String(Math.abs(Number(sm.closing_value) - Number(sm.opening_value))))}`} sub={`${sm.items_moved} items moved`} />
          <Sum label="Stock position" value={`${report.stockStatus.in_stock} in stock`} sub={`${report.stockStatus.low} low · ${report.stockStatus.out} out`} />
        </div>
        {sm.adj_count > 0 && (
          <p className="border-b border-white/80 px-5 py-2 text-sm text-warn">
            Includes {sm.adj_count} correction{sm.adj_count === 1 ? "" : "s"} with a net value of {m(sm.adj_value)}.
          </p>
        )}
        <p className="px-5 py-2 text-xs text-muted">Closing = Opening + Stock in − Stock out ± Corrections. Valued at weighted-average cost in {s.currency_code}.</p>

        {/* One table: opening, stock in + cost, stock out + cost, closing */}
        {sec.balances && (
          <Section title={report.periodType === "day" ? "Stock sheet" : "Stock sheet for the whole period"} empty={!report.balances.length ? "No items." : null}>
            <p className="border-b border-white/80 px-5 py-2 text-xs text-muted">Opening stock, stock in, stock out and their cost for every item in one table. Each closing balance (Bal) is the next day&apos;s opening stock.</p>
            <CombinedTable
              m={m}
              adj={sm.adj_count > 0}
              rows={report.balances.map((b) => ({
                id: b.item_id, name: b.name, sku: b.sku, unit: b.unit, opening: b.opening_qty, in: b.in_qty, in_value: b.in_value,
                out: b.out_qty, out_value: b.out_value, adj: b.adj_qty, closing: b.closing_qty, closing_value: b.closing_value, status: b.status,
              }))}
              totals={{ in_value: sm.in_value, out_value: sm.out_value, closing_value: sm.closing_value }}
              testId="stock-sheet"
            />
          </Section>
        )}

        {sec.balances && report.days.length > 1 && (
          <Section title={`Day by day (${report.days.length} days)`}>
            <div className="divide-y divide-white/80">
              {report.days.map((d) => {
                const inV = d.rows.reduce((a, x) => a + Number(x.in_value), 0);
                const outV = d.rows.reduce((a, x) => a + Number(x.out_value), 0);
                return (
                  <details key={d.day} className="group">
                    <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-3 text-sm font-semibold hover:bg-white/50 group-open:bg-white/60">
                      {new Date(d.day + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })}
                      <span className="text-xs font-normal text-muted">
                        {d.rows.filter((x) => x.in !== "0" || x.out !== "0").length} items moved · <span className="text-ok">in {m(String(inV))}</span> · <span className="text-burgundy">out {m(String(outV))}</span>
                      </span>
                    </summary>
                    <div className="overflow-x-auto pb-2">
                      <CombinedTable
                        m={m}
                        adj={d.rows.some((x) => x.adj !== "0")}
                        rows={d.rows.map((x) => ({ id: x.item_id, name: x.name, sku: x.sku, unit: x.unit, opening: x.opening, in: x.in, in_value: x.in_value, out: x.out, out_value: x.out_value, adj: x.adj, closing: x.closing }))}
                        totals={{ in_value: String(inV), out_value: String(outV) }}
                      />
                    </div>
                  </details>
                );
              })}
            </div>
          </Section>
        )}

        {/* General report: totals by category */}
        {report.byCategory.length > 0 && (
          <Section title="Total stock by category">
            <table className="w-full min-w-[640px] text-sm">
              <thead><tr className="text-left text-muted"><Th>Category</Th><Th right>Items</Th><Th right>Opening value</Th><Th right>Cost of stock in</Th><Th right>Cost of stock out</Th><Th right>Total stock value</Th><Th>Share</Th></tr></thead>
              <tbody className="divide-y divide-white/80">
                {report.byCategory.map((c) => {
                  const share = Number(sm.closing_value) > 0 ? (Number(c.closing_value) / Number(sm.closing_value)) * 100 : 0;
                  return (
                    <tr key={c.category}>
                      <Td><span className="font-semibold">{c.category}</span></Td><Td right>{c.items}</Td><Td right>{m(c.opening_value)}</Td>
                      <Td right><span className="text-ok">{m(c.in_value)}</span></Td><Td right><span className="text-burgundy">{m(c.out_value)}</span></Td>
                      <Td right><strong>{m(c.closing_value)}</strong></Td>
                      <Td><span className="flex items-center gap-2"><span className="h-1.5 w-20 overflow-hidden rounded-full bg-white"><span className="block h-full rounded-full bg-burgundy" style={{ width: `${share}%` }} /></span><span className="text-xs text-muted">{share.toFixed(0)}%</span></span></Td>
                    </tr>
                  );
                })}
                <tr className="font-semibold"><Td>Total</Td><Td right>{report.byCategory.reduce((a, c) => a + c.items, 0)}</Td><Td right>{m(sm.opening_value)}</Td><Td right>{m(sm.in_value)}</Td><Td right>{m(sm.out_value)}</Td><Td right>{m(sm.closing_value)}</Td><Td /></tr>
              </tbody>
            </table>
          </Section>
        )}

        {sec.stockOut && report.topOut.length > 0 && (
          <Section title="Where the stock went">
            <div className="grid grid-cols-1 gap-6 p-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
              <PieChart
                slices={report.topOut.map((t) => ({ label: t.name, value: Number(t.value), detail: `${formatQty(t.qty)} ${t.unit} · ${m(t.value)}`, href: `/items/${t.item_id}` }))}
                centerLabel="Cost of stock out"
                centerValue={m(sm.out_value).replace(/\.00$/, "")}
                emptyText="Nothing issued in this period."
              />
              <div>
                <p className="mb-2 text-sm font-semibold">Taken by worker</p>
                {report.byWorker.length ? (
                  <ul className="space-y-1.5">
                    {report.byWorker.map((w) => (
                      <li key={w.name} className="flex items-center justify-between gap-3 rounded-2xl bg-white/70 px-3 py-2 text-sm ring-1 ring-white">
                        <span className="min-w-0 truncate font-medium">{w.name}</span>
                        <span className="shrink-0 text-xs text-muted">{w.takes}× · {w.items} item{w.items === 1 ? "" : "s"} · <strong className="text-ink">{m(w.value)}</strong></span>
                      </li>
                    ))}
                  </ul>
                ) : <p className="text-sm text-muted">No stock taken.</p>}
              </div>
            </div>
          </Section>
        )}

        {(sec.stockIn || sec.stockOut) && (
          <Section title={`Stock in and stock out (${report.movements.length})`} empty={!report.movements.length ? "No stock moved in this period." : null}>
            <table className="w-full min-w-[980px] text-sm" data-testid="movements">
              <thead><tr className="text-left text-muted">
                <Th>Date & time</Th><Th>Item</Th><Th>Type</Th><Th right>Quantity</Th><Th right>Cost / unit</Th>
                {sec.stockIn && <Th right>Cost of stock in</Th>}{sec.stockOut && <Th right>Cost of stock out</Th>}
                <Th>Supplier / taken by</Th><Th>Reference / notes</Th>
              </tr></thead>
              <tbody className="divide-y divide-white/80">
                {report.movements.map((t) => {
                  const isIn = t.txn_type === "stock_in";
                  return (
                    <tr key={t.id}>
                      <Td><span className="whitespace-nowrap">{formatDateTime(t.occurred_at, tz)}</span><span className="block text-xs text-muted">{t.txn_no}</span></Td>
                      <Td wide><span className="font-semibold">{t.item_name}</span><span className="block text-xs text-muted">{t.item_sku}</span></Td>
                      <Td><span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${isIn ? "bg-ok-bg text-ok" : "bg-rose text-burgundy"}`}>{isIn ? "In" : "Out"}</span></Td>
                      <Td right>{isIn ? "+" : "−"}{formatQty(t.entered_quantity)} {t.entered_unit_symbol}</Td>
                      <Td right>{formatUnitCost(t.entered_unit_cost, sym)}</Td>
                      {sec.stockIn && <Td right>{isIn ? <span className="text-ok">{m(t.total_value)}</span> : ""}</Td>}
                      {sec.stockOut && <Td right>{!isIn ? <span className="text-burgundy">{m(t.total_value)}</span> : ""}</Td>}
                      <Td>{isIn ? (t.is_opening ? "Opening stock" : t.supplier_label ?? "-") : <>{[t.worker_name, t.recipient].filter(Boolean).join(" · to ") || "-"}<span className="block text-xs text-muted">{reasonLabel(t.reason)}</span></>}</Td>
                      <Td>{[t.reference, t.notes].filter(Boolean).join(", ") || "-"}</Td>
                    </tr>
                  );
                })}
                <tr className="font-semibold"><Td>Total</Td><Td /><Td /><Td /><Td />{sec.stockIn && <Td right>{m(sm.in_value)}</Td>}{sec.stockOut && <Td right>{m(sm.out_value)}</Td>}<Td /><Td /></tr>
              </tbody>
            </table>
          </Section>
        )}

        {sec.corrections && report.corrections.length > 0 && (
          <Section title={`Corrections (${report.corrections.length})`}>
            <table className="w-full min-w-[640px] text-sm">
              <thead><tr className="text-left text-muted"><Th>Date & time</Th><Th>Item</Th><Th>Reverses</Th><Th right>Stock effect</Th><Th right>Value effect</Th><Th>Reason</Th></tr></thead>
              <tbody className="divide-y divide-white/80">
                {report.corrections.map((t) => (
                  <tr key={t.id}>
                    <Td>{formatDateTime(t.occurred_at, tz)}<span className="block text-xs text-muted">{t.txn_no}</span></Td>
                    <Td>{t.item_name}</Td><Td>{t.reverses_txn_no}</Td>
                    <Td right>{t.direction > 0 ? "+" : "−"}{formatQty(t.quantity)} {t.unit_symbol}</Td>
                    <Td right>{t.direction > 0 ? "+" : "−"}{m(t.total_value)}</Td>
                    <Td>{t.correction_reason}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        )}

        {sec.highlights && (
          <div className="m-4 grid grid-cols-1 gap-4 sm:m-5 md:grid-cols-2">
            <Highlights title="Most stocked in" verb="received" rows={report.topIn} m={m} tone="text-ok" />
            <Highlights title="Most stocked out" verb="issued" rows={report.topOut} m={m} tone="text-burgundy" />
            <p className="text-xs text-muted md:col-span-2">Ranked by value, because items are counted in different units.</p>
          </div>
        )}
      </div>
    </div>
  );
}

type CombinedRow = {
  id: string; name: string; sku: string; unit: string; opening: string; in: string; in_value: string; out: string; out_value: string;
  adj: string; closing: string; closing_value?: string; status?: "in_stock" | "low" | "out";
};

/** S/N · Item · Opening · Stock in · Cost of stock in · Stock out · Cost of stock out · Closing (Bal) · Worth, all in one table. */
function CombinedTable({ rows, totals, adj, m, testId }: {
  rows: CombinedRow[]; totals: { in_value: string; out_value: string; closing_value?: string }; adj: boolean; m: (v: string) => string; testId?: string;
}) {
  const worth = rows.some((r) => r.closing_value !== undefined);
  return (
    <table className="w-full min-w-[1000px] text-sm" data-testid={testId}>
      <thead>
        <tr className="text-left text-muted">
          <Th>S/N</Th><Th>Item name</Th><Th right>Opening stock</Th>
          <Th right tone="ok">Stock in</Th><Th right tone="ok">Cost of stock in</Th>
          <Th right tone="out">Stock out</Th><Th right tone="out">Cost of stock out</Th>
          {adj && <Th right>Corrections</Th>}
          <Th right>Closing (Bal)</Th>{worth && <Th right>Worth</Th>}{worth && <Th>Status</Th>}
        </tr>
      </thead>
      <tbody className="divide-y divide-white/80">
        {rows.map((b, i) => (
          <tr key={b.id}>
            <Td>{i + 1}</Td>
            <Td wide><Link href={`/items/${b.id}`} className="font-semibold hover:text-burgundy">{b.name}</Link><span className="block text-xs text-muted">{b.sku}</span></Td>
            <Td right>{formatQty(b.opening)} {b.unit}</Td>
            <Td right><span className="text-ok">{Number(b.in) ? `+${formatQty(b.in)}` : "0"}</span></Td>
            <Td right>{Number(b.in_value) ? m(b.in_value) : "-"}</Td>
            <Td right><span className="text-burgundy">{Number(b.out) ? `−${formatQty(b.out)}` : "0"}</span></Td>
            <Td right>{Number(b.out_value) ? m(b.out_value) : "-"}</Td>
            {adj && <Td right>{formatQty(b.adj)}</Td>}
            <Td right><strong>{formatQty(b.closing)} {b.unit}</strong></Td>
            {worth && <Td right>{m(b.closing_value ?? "0")}</Td>}
            {worth && <Td>{b.status && <StatusBadge status={b.status} />}</Td>}
          </tr>
        ))}
        <tr className="bg-white/50 font-semibold">
          <Td /><Td>Total</Td><Td /><Td /><Td right>{m(totals.in_value)}</Td><Td /><Td right>{m(totals.out_value)}</Td>{adj && <Td />}<Td />
          {worth && <Td right>{m(totals.closing_value ?? "0")}</Td>}{worth && <Td />}
        </tr>
      </tbody>
    </table>
  );
}

function Highlights({ title, verb, rows, m, tone }: { title: string; verb: string; rows: { item_id: string; name: string; sku: string; unit: string; qty: string; value: string; count: number }[]; m: (v: string) => string; tone: string }) {
  return (
    <section className="overflow-hidden rounded-3xl bg-white/60 ring-1 ring-white" data-testid={`highlight-${verb}`}>
      <h3 className="border-b border-white/80 px-4 py-3 text-[15px] font-semibold">{title}</h3>
      {rows.length === 0 ? (
        <p className="px-4 py-5 text-sm text-muted">Nothing {verb} in this period.</p>
      ) : (
        <ol className="divide-y divide-white/80">
          {rows.map((h, i) => (
            <li key={h.item_id} className={`flex items-center gap-3 px-4 py-2.5 text-sm ${i === 0 ? "bg-rose" : ""}`}>
              <span className="w-5 text-muted">{i + 1}</span>
              <span className="min-w-0 flex-1">
                <Link href={`/items/${h.item_id}`} className={`block truncate hover:text-burgundy ${i === 0 ? "font-bold" : "font-medium"}`}>{h.name}</Link>
                <span className="text-xs text-muted">{h.count} transaction{h.count === 1 ? "" : "s"}</span>
              </span>
              <span className="text-right">
                <span className={`block font-semibold ${tone}`}>{formatQty(h.qty)} {h.unit}</span>
                <span className="text-xs text-muted">{m(h.value)}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function Sum({ label, value, sub, tone, strong }: { label: string; value: string; sub?: string; tone?: string; strong?: boolean }) {
  return (
    <div className={`-mb-px -mr-px border-b border-r border-white/80 px-5 py-4 ${strong ? "bg-rose" : ""}`}>
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-0.5 font-display text-lg font-bold tracking-tight sm:text-xl ${tone ?? ""}`}>{value}</p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </div>
  );
}
function Section({ title, children, empty }: { title: string; children: React.ReactNode; empty?: string | null }) {
  return (
    <Panel title={title} className="m-3 bg-white/50 sm:m-4" bodyClass="overflow-x-auto">
      {empty ? <p className="px-5 py-6 text-sm text-muted">{empty}</p> : children}
    </Panel>
  );
}
const Th = ({ children, right, tone }: { children?: React.ReactNode; right?: boolean; tone?: "ok" | "out" }) => (
  <th className={`whitespace-nowrap border-b border-white/80 px-4 py-2.5 font-semibold ${right ? "text-right" : ""} ${tone === "ok" ? "bg-ok-bg/60 text-ok" : tone === "out" ? "bg-rose/70 text-burgundy" : "bg-white/40"}`}>{children}</th>
);
const Td = ({ children, right, wide }: { children?: React.ReactNode; right?: boolean; wide?: boolean }) => (
  <td className={`px-4 py-2.5 align-top ${right ? "whitespace-nowrap text-right" : ""} ${wide ? "min-w-44" : ""}`}>{children}</td>
);
