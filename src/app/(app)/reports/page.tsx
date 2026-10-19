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

        {/* Summary */}
        <div className="grid grid-cols-2 border-b border-white/80 sm:grid-cols-4">
          <Sum label="Opening value" value={m(sm.opening_value)} />
          <Sum label="Stock in value" value={m(sm.in_value)} sub={`${sm.in_count} transactions`} tone="text-ok" />
          <Sum label="Stock out value" value={m(sm.out_value)} sub={`${sm.out_count} transactions`} tone="text-burgundy" />
          <Sum label="Closing value" value={m(sm.closing_value)} sub={`${sm.items_moved} items moved`} strong />
        </div>
        {sm.adj_count > 0 && (
          <p className="border-b border-white/80 px-5 py-2 text-sm text-warn">
            Includes {sm.adj_count} correction{sm.adj_count === 1 ? "" : "s"} with a net value of {m(sm.adj_value)}.
          </p>
        )}
        <p className="px-5 py-2 text-xs text-muted">Closing = Opening + Stock in − Stock out ± Corrections. Valued at weighted-average cost in {s.currency_code}.</p>

        {/* Stock sheet: S/N, item, opening, in, out, closing (Bal) */}
        {sec.balances && (
          <Section title={report.periodType === "day" ? "Stock sheet" : "Stock sheet — whole period"} empty={!report.balances.length ? "No items." : null}>
            <p className="border-b border-white/80 px-5 py-2 text-xs text-muted">Each item&apos;s closing balance (Bal) is carried forward as its opening stock for the next day.</p>
            <table className="w-full min-w-[860px] text-sm" data-testid="stock-sheet">
              <thead><tr className="text-left text-muted">
                <Th>S/N</Th><Th>Item name</Th><Th right>Opening stock</Th><Th right>Stock in</Th><Th right>Stock out</Th>{sm.adj_count > 0 && <Th right>Corrections</Th>}<Th right>Closing (Bal)</Th><Th right>Worth</Th><Th>Status</Th>
              </tr></thead>
              <tbody className="divide-y divide-white/80">
                {report.balances.map((b, i) => (
                  <tr key={b.item_id}>
                    <Td>{i + 1}</Td>
                    <Td><Link href={`/items/${b.item_id}`} className="font-semibold hover:text-burgundy">{b.name}</Link><span className="block text-xs text-muted">{b.sku}</span></Td>
                    <Td right>{formatQty(b.opening_qty)} {b.unit}</Td>
                    <Td right><span className="text-ok">{Number(b.in_qty) ? `+${formatQty(b.in_qty)}` : "0"}</span></Td>
                    <Td right><span className="text-burgundy">{Number(b.out_qty) ? `−${formatQty(b.out_qty)}` : "0"}</span></Td>
                    {sm.adj_count > 0 && <Td right>{formatQty(b.adj_qty)}</Td>}
                    <Td right><strong>{formatQty(b.closing_qty)} {b.unit}</strong></Td>
                    <Td right>{m(b.closing_value)}</Td>
                    <Td><StatusBadge status={b.status} /></Td>
                  </tr>
                ))}
                <tr className="font-semibold"><Td /><Td>Total</Td><Td /><Td /><Td />{sm.adj_count > 0 && <Td />}<Td /><Td right>{m(sm.closing_value)}</Td><Td /></tr>
              </tbody>
            </table>
          </Section>
        )}

        {sec.balances && report.days.length > 1 && (
          <Section title={`Day by day (${report.days.length} days)`}>
            <div className="divide-y divide-white/80">
              {report.days.map((d) => (
                <details key={d.day} className="group">
                  <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3 text-sm font-semibold hover:bg-white/50">
                    {new Date(d.day + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })}
                    <span className="text-xs font-normal text-muted">
                      {d.rows.filter((x) => x.in !== "0" || x.out !== "0").length} items moved <span className="ml-1 inline-block transition-transform group-open:rotate-90">›</span>
                    </span>
                  </summary>
                  <div className="overflow-x-auto pb-2">
                    <table className="w-full min-w-[640px] text-sm">
                      <thead><tr className="text-left text-muted"><Th>S/N</Th><Th>Item name</Th><Th right>Opening stock</Th><Th right>Stock in</Th><Th right>Stock out</Th><Th right>Closing (Bal)</Th></tr></thead>
                      <tbody className="divide-y divide-white/80">
                        {d.rows.map((x, i) => (
                          <tr key={x.item_id}><Td>{i + 1}</Td><Td>{x.name}</Td><Td right>{formatQty(x.opening)} {x.unit}</Td><Td right>{formatQty(x.in)}</Td><Td right>{formatQty(x.out)}</Td><Td right><strong>{formatQty(x.closing)} {x.unit}</strong></Td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              ))}
            </div>
          </Section>
        )}

        {sec.stockOut && report.topOut.length > 0 && (
          <Section title="Where the stock went">
            <div className="grid grid-cols-1 gap-6 p-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
              <PieChart
                slices={report.topOut.map((t) => ({ label: t.name, value: Number(t.value), detail: `${formatQty(t.qty)} ${t.unit} · ${m(t.value)}`, href: `/items/${t.item_id}` }))}
                centerLabel="Stock out value"
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

        {sec.stockIn && (
          <Section title={`Stock in (${report.stockIn.length})`} empty={!report.stockIn.length ? "No stock received in this period." : null}>
            <table className="w-full min-w-[760px] text-sm">
              <thead><tr className="text-left text-muted">
                <Th>Date & time</Th><Th>Item</Th><Th right>Quantity</Th><Th right>Cost / unit</Th><Th right>Total value</Th><Th>Supplier</Th><Th>Reference / notes</Th>
              </tr></thead>
              <tbody className="divide-y divide-white/80">
                {report.stockIn.map((t) => (
                  <tr key={t.id}>
                    <Td>{formatDateTime(t.occurred_at, tz)}<span className="block text-xs text-muted">{t.txn_no}</span></Td>
                    <Td><span className="font-semibold">{t.item_name}</span><span className="block text-xs text-muted">{t.item_sku}</span></Td>
                    <Td right>{formatQty(t.entered_quantity)} {t.entered_unit_symbol}</Td>
                    <Td right>{formatUnitCost(t.entered_unit_cost, sym)}</Td>
                    <Td right>{m(t.total_value)}</Td>
                    <Td>{t.is_opening ? "Opening stock" : t.supplier_label ?? "—"}</Td>
                    <Td>{[t.reference, t.notes].filter(Boolean).join(" — ") || "—"}</Td>
                  </tr>
                ))}
                <tr className="font-semibold"><Td>Total</Td><Td /><Td /><Td /><Td right>{m(sm.in_value)}</Td><Td /><Td /></tr>
              </tbody>
            </table>
          </Section>
        )}

        {sec.stockOut && (
          <Section title={`Stock out (${report.stockOut.length})`} empty={!report.stockOut.length ? "No stock issued in this period." : null}>
            <table className="w-full min-w-[820px] text-sm">
              <thead><tr className="text-left text-muted">
                <Th>Date & time</Th><Th>Item</Th><Th right>Quantity</Th><Th right>Cost / unit</Th><Th right>Total value</Th><Th>Reason</Th><Th>Taken by</Th><Th>Reference / notes</Th>
              </tr></thead>
              <tbody className="divide-y divide-white/80">
                {report.stockOut.map((t) => (
                  <tr key={t.id}>
                    <Td>{formatDateTime(t.occurred_at, tz)}<span className="block text-xs text-muted">{t.txn_no}</span></Td>
                    <Td><span className="font-semibold">{t.item_name}</span><span className="block text-xs text-muted">{t.item_sku}</span></Td>
                    <Td right>{formatQty(t.entered_quantity)} {t.entered_unit_symbol}</Td>
                    <Td right>{formatUnitCost(t.entered_unit_cost, sym)}</Td>
                    <Td right>{m(t.total_value)}</Td>
                    <Td>{reasonLabel(t.reason)}</Td>
                    <Td>{[t.worker_name, t.recipient].filter(Boolean).join(" → ") || "—"}</Td>
                    <Td>{[t.reference, t.notes].filter(Boolean).join(" — ") || "—"}</Td>
                  </tr>
                ))}
                <tr className="font-semibold"><Td>Total</Td><Td /><Td /><Td /><Td right>{m(sm.out_value)}</Td><Td /><Td /><Td /></tr>
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

function Highlights({ title, verb, rows, m, tone }: { title: string; verb: string; rows: { item_id: string; name: string; sku: string; unit: string; qty: string; value: string; count: number }[]; m: (v: string) => string; tone: string }) {
  return (
    <section className="rounded-lg border border-line" data-testid={`highlight-${verb}`}>
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
    <div className={`border-line px-5 py-4 [&:not(:last-child)]:border-r max-sm:[&:nth-child(2)]:border-r-0 max-sm:[&:nth-child(-n+2)]:border-b ${strong ? "bg-rose" : ""}`}>
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-0.5 font-display text-xl font-bold tracking-tight sm:text-2xl ${tone ?? ""}`}>{value}</p>
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
const Th = ({ children, right }: { children?: React.ReactNode; right?: boolean }) => (
  <th className={`whitespace-nowrap border-b border-white/80 bg-white/40 px-4 py-2.5 font-semibold ${right ? "text-right" : ""}`}>{children}</th>
);
const Td = ({ children, right }: { children?: React.ReactNode; right?: boolean }) => (
  <td className={`px-4 py-2.5 align-top ${right ? "whitespace-nowrap text-right" : ""}`}>{children}</td>
);
