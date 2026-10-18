import Link from "next/link";
import { AlertTriangle, Download, PackageMinus, PackagePlus, Plus, Boxes, History } from "lucide-react";
import { EmptyState, LinkButton, PageHeader, Panel, StatusBadge } from "@/components/ui/primitives";
import { TxnList } from "@/components/txn-list";
import { StockButtons } from "@/components/stock-dialog";
import { requirePageUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { dashboardStats } from "@/lib/inventory";
import { getSettings } from "@/lib/settings";
import { formatDate, formatMoney, formatQty, todayIn } from "@/lib/format";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const user = await requirePageUser("view");
  const s = await getSettings();
  const d = await dashboardStats(s.timezone);
  const { denied } = await searchParams;
  const sym = s.currency_symbol;
  const maxDay = Math.max(1, ...d.week.flatMap((w) => [Number(w.in_value), Number(w.out_value)]));
  const canMove = can(user.role, "stock.move");

  return (
    <div>
      {denied && (
        <p className="mb-4 rounded-md bg-warn-bg px-4 py-3 text-sm text-warn">That page is only available to the store owner.</p>
      )}
      <PageHeader
        title="Dashboard"
        description={formatDate(todayIn(s.timezone))}
        actions={
          <>
            {canMove && <LinkButton href="/stock-in" variant="secondary"><PackagePlus className="size-4" /> Stock In</LinkButton>}
            {canMove && <LinkButton href="/stock-out"><PackageMinus className="size-4" /> Stock Out</LinkButton>}
            {can(user.role, "item.write") && <LinkButton href="/items/new" variant="secondary"><Plus className="size-4" /> Add New Item</LinkButton>}
            <a href="/api/reports/export?preset=today&format=pdf" className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-white px-4 text-sm font-semibold hover:bg-rose">
              <Download className="size-4" /> Today&apos;s report
            </a>
          </>
        }
      />

      {/* Worth + today's movement */}
      <section className="overflow-hidden rounded-lg border border-line bg-white">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,2fr)]">
          <div className="bg-claret px-5 py-6 text-white sm:px-6">
            <p className="text-sm text-white/70">Total inventory worth</p>
            <p className="mt-1 font-display text-4xl font-bold tracking-tight sm:text-5xl" data-testid="inventory-worth">
              {formatMoney(d.totals.worth, sym)}
            </p>
            <p className="mt-2 text-sm text-white/70">
              {d.totals.items} {d.totals.items === 1 ? "item" : "items"} · weighted-average cost
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-px bg-line sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
            <Stat label="Received today" value={formatMoney(d.today.in_value, sym)} sub={`${d.today.in_count} receipt${d.today.in_count === 1 ? "" : "s"}`} tone="ok" />
            <Stat label="Issued today" value={formatMoney(d.today.out_value, sym)} sub={`${d.today.out_count} issue${d.today.out_count === 1 ? "" : "s"}`} tone="brand" />
            <Stat label="Low stock" value={String(d.totals.low)} sub="at or below minimum" tone={d.totals.low ? "warn" : undefined} href="/low-stock" />
            <Stat label="Out of stock" value={String(d.totals.out)} sub="need restocking" tone={d.totals.out ? "bad" : undefined} href="/low-stock?status=out" />
          </dl>
        </div>
        {d.byUnit.length > 0 && (
          <div className="border-t border-line px-5 py-3 sm:px-6">
            <p className="text-xs text-muted">
              Stock on hand by unit:{" "}
              {d.byUnit.map((u, i) => (
                <span key={u.symbol} className="text-ink">
                  {i > 0 && <span className="text-line"> | </span>}
                  <strong>{formatQty(u.qty)}</strong> {u.symbol}
                </span>
              ))}
            </p>
          </div>
        )}
      </section>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Panel title="Recent stock movements" actions={<Link href="/transactions" className="text-sm font-semibold text-burgundy hover:underline">All transactions</Link>} bodyClass="">
          {d.recent.length ? (
            <TxnList rows={d.recent} symbol={sym} timeZone={s.timezone} />
          ) : (
            <EmptyState icon={<History className="size-6" />} title="No stock movements yet" body="Stock In and Stock Out entries will show here as they're recorded." />
          )}
        </Panel>

        <div className="space-y-6">
          <Panel title="Needs attention" actions={<Link href="/low-stock" className="text-sm font-semibold text-burgundy hover:underline">Low stock list</Link>} bodyClass="">
            {d.attention.length ? (
              <ul className="divide-y divide-line">
                {d.attention.map((it) => (
                  <li key={it.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                    <div className="min-w-0 flex-1">
                      <Link href={`/items/${it.id}`} className="block truncate font-semibold hover:text-burgundy">{it.name}</Link>
                      <p className="text-xs text-muted">
                        {formatQty(it.quantity)} {it.unit_symbol} left · minimum {formatQty(it.min_stock_level)} {it.unit_symbol}
                      </p>
                    </div>
                    <StatusBadge status={it.status} />
                    {canMove && <StockButtons itemId={it.id} name={it.name} />}
                  </li>
                ))}
              </ul>
            ) : d.totals.items ? (
              <EmptyState icon={<AlertTriangle className="size-6" />} title="Nothing is running low" body="Items appear here when they reach their minimum stock level." />
            ) : (
              <EmptyState icon={<Boxes className="size-6" />} title="Add your first item" body="Start by adding the items your store keeps." action={can(user.role, "item.write") ? <LinkButton href="/items/new">Add New Item</LinkButton> : undefined} />
            )}
          </Panel>

          <Panel title="Last 7 days">
            <div className="flex items-end gap-2" aria-label="Stock received and issued per day">
              {d.week.map((w) => (
                <div key={w.day} className="flex flex-1 flex-col items-center gap-1.5">
                  <div className="flex h-28 w-full items-end justify-center gap-0.5">
                    <div className="w-1/2 max-w-3 rounded-t bg-ok/70" style={{ height: `${(Number(w.in_value) / maxDay) * 100}%` }}
                      title={`Received ${formatMoney(w.in_value, sym)}`} />
                    <div className="w-1/2 max-w-3 rounded-t bg-burgundy" style={{ height: `${(Number(w.out_value) / maxDay) * 100}%` }}
                      title={`Issued ${formatMoney(w.out_value, sym)}`} />
                  </div>
                  <span className="text-[11px] text-muted">
                    {new Date(w.day + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" })}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-3 flex gap-4 text-xs text-muted">
              <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-ok/70" /> Received (value)</span>
              <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-burgundy" /> Issued (value)</span>
            </div>
            <div className="sr-only"><table>
              <caption>Daily movement</caption>
              <tbody>{d.week.map((w) => <tr key={w.day}><td>{w.day}</td><td>{w.in_value}</td><td>{w.out_value}</td></tr>)}</tbody>
            </table></div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, tone, href }: { label: string; value: string; sub: string; tone?: "ok" | "brand" | "warn" | "bad"; href?: string }) {
  const color = { ok: "text-ok", brand: "text-burgundy", warn: "text-warn", bad: "text-bad" }[tone ?? "ok"];
  const inner = (
    <>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`mt-1 font-display text-2xl font-bold tracking-tight ${tone ? color : "text-ink"}`}>{value}</dd>
      <dd className="text-xs text-muted">{sub}</dd>
    </>
  );
  return (
    <div className="bg-white px-5 py-5">
      {href ? <Link href={href} className="block hover:opacity-80">{inner}</Link> : inner}
    </div>
  );
}
