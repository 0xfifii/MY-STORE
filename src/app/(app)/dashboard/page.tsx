import { StockInIcon, StockOutIcon } from "@/components/icons";
import Link from "next/link";
import { AlertTriangle, Download, Plus, Boxes, History, TrendingDown, TrendingUp } from "lucide-react";
import { EmptyState, LinkButton, PageHeader, Panel, StatusBadge } from "@/components/ui/primitives";
import { TxnList } from "@/components/txn-list";
import { StockButtons } from "@/components/stock-dialog";
import { PieChart } from "@/components/pie-chart";
import { requirePageUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { dashboardStats } from "@/lib/inventory";
import { toSlices, usageAnalysis } from "@/lib/analytics";
import { getSettings } from "@/lib/settings";
import { addDays, formatDate, formatMoney, formatQty, todayIn } from "@/lib/format";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const user = await requirePageUser("view");
  const s = await getSettings();
  const today = todayIn(s.timezone);
  const [d, usage] = await Promise.all([
    dashboardStats(s.timezone),
    usageAnalysis({ from: addDays(today, -29), to: today, tz: s.timezone }),
  ]);
  const { denied } = await searchParams;
  const sym = s.currency_symbol;
  const maxDay = Math.max(1, ...d.week.flatMap((w) => [Number(w.in_value), Number(w.out_value)]));
  const most = usage.items[0];
  const least = usage.items.length > 1 ? usage.items[usage.items.length - 1] : null;
  const dayName = new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: s.timezone }).format(new Date());

  return (
    <div>
      {denied && (
        <p className="mb-4 rounded-2xl bg-warn-bg px-4 py-3 text-sm text-warn">You don&apos;t have permission to open that page. Ask the store owner.</p>
      )}
      <PageHeader
        title={`${dayName}`}
        description={`${formatDate(today)} · ${s.store_name}`}
        actions={
          <>
            {can(user, "stock.in") && <LinkButton href="/stock-in" variant="secondary"><StockInIcon className="size-[18px]" /> Stock In</LinkButton>}
            {can(user, "stock.out") && <LinkButton href="/stock-out" variant="accent"><StockOutIcon className="size-[18px]" /> Stock Out</LinkButton>}
            {can(user, "item.write") && <LinkButton href="/items/new" variant="secondary"><Plus className="size-4" /> Add Item</LinkButton>}
            <a href="/api/reports/export?preset=today&format=pdf" className="inline-flex h-10 items-center gap-2 rounded-full bg-night px-5 text-sm font-semibold text-white hover:bg-claret">
              <Download className="size-4" /> Today&apos;s report
            </a>
          </>
        }
      />

      {/* Worth + today */}
      <section className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,2fr)]">
        <div className="lift relative overflow-hidden rounded-[var(--radius-card)] bg-gradient-to-br from-night via-[#2b1419] to-claret p-6 text-white">
          <div className="glow-orb pointer-events-none absolute -right-16 -top-20 size-64 rounded-full opacity-70" aria-hidden />
          <p className="relative text-sm text-white/60">Total inventory worth</p>
          <p className="relative mt-2 text-[40px] font-light leading-none tracking-tight sm:text-5xl" data-testid="inventory-worth">
            {formatMoney(d.totals.worth, sym)}
          </p>
          <p className="relative mt-3 text-sm text-white/60">{d.totals.items} {d.totals.items === 1 ? "item" : "items"} · weighted-average cost</p>
          {d.byUnit.length > 0 && (
            <p className="relative mt-5 flex flex-wrap gap-1.5 text-xs">
              {d.byUnit.slice(0, 6).map((u) => (
                <span key={u.symbol} className="rounded-full bg-white/10 px-2.5 py-1"><strong>{formatQty(u.qty)}</strong> {u.symbol}</span>
              ))}
            </p>
          )}
        </div>
        <dl className="stagger grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
          <Stat label="Received today" value={formatMoney(d.today.in_value, sym)} sub={`${d.today.in_count} receipt${d.today.in_count === 1 ? "" : "s"}`} accent="sky" href="/transactions?type=stock_in" icon={<StockInIcon className="size-5" />} />
          <Stat label="Issued today" value={formatMoney(d.today.out_value, sym)} sub={`${d.today.out_count} issue${d.today.out_count === 1 ? "" : "s"}`} accent="burgundy" href="/transactions?type=stock_out" icon={<StockOutIcon className="size-5" />} />
          <Stat label="Low stock" value={String(d.totals.low)} sub="at or below minimum" accent="gold" href="/low-stock" icon={<AlertTriangle className="size-5" />} />
          <Stat label="Out of stock" value={String(d.totals.out)} sub="need restocking" accent="coral" href="/low-stock?status=out" icon={<Boxes className="size-5" />} />
        </dl>
      </section>

      {/* Most / least taken */}
      <Panel className="mt-4" title="Most and least taken items · last 30 days"
        actions={can(user, "audit.view") ? <Link href="/audit" className="text-sm font-semibold text-burgundy hover:underline">Full usage analysis</Link> : undefined}>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <PieChart
            slices={toSlices(usage.items, sym)}
            centerLabel="Value taken"
            centerValue={formatMoney(usage.totals.value, sym).replace(/\.00$/, "")}
            emptyText="No stock has been taken out in the last 30 days."
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <Callout icon={<TrendingUp className="size-5" />} label="Most taken" item={most} sym={sym} tone="bg-night text-white" />
            <Callout icon={<TrendingDown className="size-5" />} label="Least taken" item={least} sym={sym} tone="bg-white/80 text-ink ring-1 ring-white" />
            {usage.neverTaken.length > 0 && (
              <p className="text-xs text-muted sm:col-span-2 lg:col-span-1">
                Not taken at all: {usage.neverTaken.slice(0, 6).map((n) => n.name).join(", ")}
                {usage.neverTaken.length > 6 ? ` and ${usage.neverTaken.length - 6} more` : ""}
              </p>
            )}
          </div>
        </div>
      </Panel>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Panel title="Recent stock movements" actions={<Link href="/transactions" className="text-sm font-semibold text-burgundy hover:underline">All transactions</Link>} bodyClass="">
          {d.recent.length ? (
            <TxnList rows={d.recent} symbol={sym} timeZone={s.timezone} />
          ) : (
            <EmptyState icon={<History className="size-6" />} title="No stock movements yet" body="Stock In and Stock Out entries will show here as they're recorded." />
          )}
        </Panel>

        <div className="space-y-4">
          <Panel title="Needs attention" actions={<Link href="/low-stock" className="text-sm font-semibold text-burgundy hover:underline">Low stock</Link>} bodyClass="">
            {d.attention.length ? (
              <ul className="divide-y divide-white/80">
                {d.attention.map((it) => (
                  <li key={it.id} className="flex flex-wrap items-center gap-3 px-5 py-3 sm:px-6">
                    <div className="min-w-0 flex-1">
                      <Link href={`/items/${it.id}`} className="block truncate font-semibold hover:text-burgundy">{it.name}</Link>
                      <p className="text-xs text-muted">{formatQty(it.quantity)} {it.unit_symbol} left · min {formatQty(it.min_stock_level)}</p>
                    </div>
                    <StatusBadge status={it.status} />
                    <StockButtons itemId={it.id} name={it.name} />
                  </li>
                ))}
              </ul>
            ) : d.totals.items ? (
              <EmptyState icon={<AlertTriangle className="size-6" />} title="Nothing is running low" body="Items appear here when they reach their minimum stock level." />
            ) : (
              <EmptyState icon={<Boxes className="size-6" />} title="Add your first item" body="Start by adding the items your store keeps." action={can(user, "item.write") ? <LinkButton href="/items/new">Add New Item</LinkButton> : undefined} />
            )}
          </Panel>

          <Panel title="Last 7 days">
            <div className="flex items-end gap-2" role="img" aria-label="Stock received and issued value per day, last 7 days">
              {d.week.map((w) => (
                <div key={w.day} className="group flex flex-1 flex-col items-center gap-1.5">
                  <div className="flex h-28 w-full items-end justify-center gap-[2px] transition-transform duration-200 group-hover:scale-y-105 origin-bottom">
                    <div className="w-1/2 max-w-3 rounded-t bg-sky" style={{ height: `${(Number(w.in_value) / maxDay) * 100}%` }} title={`Received ${formatMoney(w.in_value, sym)}`} />
                    <div className="w-1/2 max-w-3 rounded-t bg-burgundy" style={{ height: `${(Number(w.out_value) / maxDay) * 100}%` }} title={`Issued ${formatMoney(w.out_value, sym)}`} />
                  </div>
                  <span className="text-[11px] text-muted">{new Date(w.day + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" })}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 flex gap-4 text-xs text-muted">
              <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-sky" /> Received (value)</span>
              <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-burgundy" /> Issued (value)</span>
            </div>
            <div className="sr-only"><table><caption>Daily movement</caption><tbody>{d.week.map((w) => <tr key={w.day}><td>{w.day}</td><td>{w.in_value}</td><td>{w.out_value}</td></tr>)}</tbody></table></div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

const ACCENTS = {
  sky: { icon: "bg-sky text-white", bar: "bg-sky", text: "text-sky" },
  burgundy: { icon: "bg-burgundy text-white", bar: "bg-burgundy", text: "text-burgundy" },
  gold: { icon: "bg-gold text-night", bar: "bg-gold", text: "text-warn" },
  coral: { icon: "bg-coral text-white", bar: "bg-coral", text: "text-bad" },
};

function Stat({ label, value, sub, accent, href, icon }: { label: string; value: string; sub: string; accent: keyof typeof ACCENTS; href: string; icon: React.ReactNode }) {
  const a = ACCENTS[accent];
  return (
    <Link href={href} className="glass lift group relative block overflow-hidden rounded-[var(--radius-card)] p-4">
      <span className={`absolute inset-x-0 top-0 h-1 ${a.bar} opacity-80`} aria-hidden />
      <div className="flex items-center justify-between">
        <dt className="text-xs text-muted">{label}</dt>
        <span className={`flex size-9 items-center justify-center rounded-full shadow-sm transition-transform duration-200 group-hover:rotate-6 group-hover:scale-110 ${a.icon}`}>{icon}</span>
      </div>
      <dd className={`mt-3 text-2xl font-semibold tracking-tight ${Number(value.replace(/[^\d.]/g, "")) === 0 ? "text-ink" : a.text}`}>{value}</dd>
      <dd className="text-xs text-muted">{sub}</dd>
    </Link>
  );
}

function Callout({ icon, label, item, sym, tone }: {
  icon: React.ReactNode; label: string; sym: string; tone: string;
  item: { item_id: string; name: string; qty: string; unit: string; value: string; takes: number } | null | undefined;
}) {
  return (
    <div className={`rounded-3xl p-4 ${tone}`}>
      <p className="flex items-center gap-2 text-xs opacity-70">{icon} {label}</p>
      {item ? (
        <>
          <Link href={`/items/${item.item_id}`} className="mt-2 block truncate text-lg font-semibold hover:underline">{item.name}</Link>
          <p className="text-sm opacity-75">{formatQty(item.qty)} {item.unit} · {formatMoney(item.value, sym)} · {item.takes} time{item.takes === 1 ? "" : "s"}</p>
        </>
      ) : (
        <p className="mt-2 text-sm opacity-70">Not enough stock-outs yet.</p>
      )}
    </div>
  );
}
