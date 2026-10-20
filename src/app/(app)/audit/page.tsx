import Link from "next/link";
import { Download, TrendingDown, TrendingUp } from "lucide-react";
import { PageHeader, Panel } from "@/components/ui/primitives";
import { PieChart } from "@/components/pie-chart";
import { Pagination } from "@/components/list-filters";
import { UsageFilters } from "@/components/usage-filters";
import { requirePageUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { PeriodBar } from "@/components/period-bar";
import { AuditItemSearch } from "@/components/audit-item-search";
import type { DistMode } from "@/lib/audit-analytics";
import { resolvePeriod } from "./period";
import { OverviewTab } from "./overview";
import { ItemTab } from "./item";
import { PricesTab, PurchasesTab, StockOutTab } from "./analysis";
import { auditEntries, categoryUsage, moneyByPeriod, moneySlices, spendAnalysis, toSlices, usageAnalysis, userActivity, workerItems, type Grouping, type PeriodMoney, type SpendBy } from "@/lib/analytics";
import { listCategories, listWorkers } from "@/lib/catalog";
import { query } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { addDays, formatDateTime, formatMoney, formatQty, reasonLabel, todayIn } from "@/lib/format";

export const metadata = { title: "Audit & Analytics" };

const D = /^\d{4}-\d{2}-\d{2}$/;

const LABELS: Record<string, string> = {
  "item.create": "Added item", "item.update": "Edited item", "item.archive": "Archived item", "item.restore": "Restored item", "item.delete": "Deleted item",
  "item.conversion.set": "Set unit conversion", "item.conversion.remove": "Removed unit conversion",
  "transaction.reverse": "Reversed a transaction", "settings.update": "Changed store settings",
  "user.create": "Added user", "user.update": "Changed user", "user.permissions": "Changed user permissions",
  "category.create": "Added category", "category.update": "Changed category",
  "supplier.create": "Added supplier", "supplier.update": "Changed supplier", "supplier.archive": "Archived supplier", "supplier.restore": "Restored supplier",
  "worker.create": "Added worker", "worker.update": "Changed worker", "worker.archive": "Archived worker", "worker.restore": "Restored worker",
  "unit.create": "Added unit", "unit_conversion.set": "Set conversion rule", "unit_conversion.remove": "Removed conversion rule",
  "setup.owner_created": "Created owner account",
  "count.record": "Recorded a stock count", "count.approve": "Approved a stock count", "count.reject": "Rejected a stock count",
  "settings.email": "Changed the email account",
};

type SP = {
  tab?: string; group?: string; spend?: string; range?: string; from?: string; to?: string; worker?: string; item?: string; category?: string;
  user?: string; area?: string; page?: string; p?: string; d?: string; mode?: string; by?: string; unit?: string; month?: string; sort?: string;
  q?: string; dir?: string; pitem?: string;
};

const TABS: [string, string][] = [
  ["overview", "Overview"], ["item", "Item performance"], ["purchases", "Purchases"], ["stockout", "Stock out"],
  ["prices", "Price tracking"], ["usage", "Usage & spending"], ["changes", "Change log"],
];

export default async function AuditPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePageUser("audit.view");
  const sp = await searchParams;
  const s = await getSettings();
  const sym = s.currency_symbol;
  const today = todayIn(s.timezone);
  const tab = TABS.some(([k]) => k === sp.tab) ? sp.tab! : "overview";
  const link = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]);
    for (const [k, v] of Object.entries(patch)) { if (v) next.set(k, v); else next.delete(k); }
    if (patch.tab !== undefined) { next.delete("page"); next.delete("sort"); }
    return `/audit?${next}`;
  };
  const tabHref = (k: string) => {
    const keep = ["p", "d", "from", "to", "range"].filter((x) => sp[x as keyof SP]);
    const next = new URLSearchParams(keep.map((x) => [x, sp[x as keyof SP]!]));
    if (k !== "overview") next.set("tab", k);
    if (k === "item" && sp.item) { next.set("item", sp.item); if (sp.month) next.set("month", sp.month); }
    return `/audit?${next}`;
  };

  // Usage & change-log tabs keep their own range presets.
  const presets: Record<string, [string, string]> = {
    "7": [addDays(today, -6), today],
    "30": [addDays(today, -29), today],
    "90": [addDays(today, -89), today],
    month: [today.slice(0, 8) + "01", today],
    "12w": [addDays(today, -83), today],
    "12m": [(() => { const d = new Date(today + "T12:00:00Z"); d.setUTCMonth(d.getUTCMonth() - 11, 1); return d.toISOString().slice(0, 10); })(), today],
  };
  let [from, to] = presets[sp.range ?? "30"] ?? presets["30"];
  if (sp.range === "custom" && sp.from && D.test(sp.from)) { from = sp.from; to = sp.to && D.test(sp.to) ? sp.to : today; }
  if (to < from) [from, to] = [to, from];
  const f = {
    workerId: /^\d+$/.test(sp.worker ?? "") ? Number(sp.worker) : null,
    itemId: /^[0-9a-f-]{36}$/i.test(sp.item ?? "") ? sp.item! : null,
    categoryId: /^\d+$/.test(sp.category ?? "") ? Number(sp.category) : null,
  };
  const group: Grouping = sp.group === "week" || sp.group === "month" ? sp.group : "day";
  const spendBy: SpendBy = sp.spend === "category" || sp.spend === "supplier" ? sp.spend : "item";
  const period = resolvePeriod(sp, today);
  const pr = { from: period.from, to: period.to, tz: s.timezone };
  const month = sp.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month) && sp.month <= today.slice(0, 7) ? sp.month : today.slice(0, 7);
  const usesPeriod = ["overview", "purchases", "stockout", "prices"].includes(tab);
  const usesRange = tab === "usage" || tab === "changes";

  const [workers, categories, items, users, itemName] = await Promise.all([
    usesRange ? listWorkers(true) : Promise.resolve([]),
    usesRange ? listCategories() : Promise.resolve([]),
    usesRange ? query<{ id: string; name: string }>("SELECT id, name FROM items ORDER BY lower(name)") : Promise.resolve([]),
    usesRange ? query<{ id: string; name: string }>("SELECT id, name FROM users ORDER BY name") : Promise.resolve([]),
    tab === "item" && f.itemId ? query<{ name: string }>("SELECT name FROM items WHERE id = $1", [f.itemId]).then((x) => x[0]?.name ?? null) : Promise.resolve(null),
  ]);

  return (
    <div>
      <PageHeader
        title="Audit & Analytics"
        description="Inventory value, purchases, stock out, purchase prices, stock counts and every change — from the real stock records."
        actions={tab === "usage" ? (
          <a href={`/api/usage/export?from=${from}&to=${to}&group=${group}${f.workerId ? `&worker=${f.workerId}` : ""}${f.itemId ? `&item=${f.itemId}` : ""}${f.categoryId ? `&category=${f.categoryId}` : ""}`}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-night px-5 text-sm font-semibold text-white transition hover:bg-claret active:scale-95">
            <Download className="size-4" /> Download analysis
          </a>
        ) : (
          <a href={`/api/audit/export?month=${(usesPeriod ? period.from : month + "-01").slice(0, 7)}&format=pdf`}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-night px-5 text-sm font-semibold text-white transition hover:bg-claret active:scale-95">
            <Download className="size-4" /> Monthly audit report
          </a>
        )}
      />

      <nav className="-mx-4 mb-4 overflow-x-auto px-4 sm:mx-0 sm:px-0" aria-label="Audit sections">
        <div className="flex w-max gap-1 rounded-full bg-white/60 p-1 ring-1 ring-white">
          {TABS.map(([k, l]) => (
            <Link key={k} href={tabHref(k)} scroll={false} aria-current={tab === k ? "page" : undefined}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200 active:scale-95 ${tab === k ? "bg-gradient-to-br from-[#9c2a45] to-[#5e1528] text-white shadow-md" : "text-muted hover:bg-white hover:text-ink"}`}>
              {l}
            </Link>
          ))}
        </div>
      </nav>

      {usesPeriod && <div className="mb-4"><PeriodBar kind={period.kind} label={period.label} prev={period.prev} next={period.next} from={period.from} to={period.to} /></div>}
      {usesRange && (
        <UsageFilters
          tab={tab}
          workers={workers.map((w) => ({ value: String(w.id), label: w.name }))}
          items={items.map((i) => ({ value: i.id, label: i.name }))}
          categories={categories.map((c) => ({ value: String(c.id), label: c.name }))}
          users={users.map((u) => ({ value: u.id, label: u.name }))}
        />
      )}
      {tab === "item" && <div className="mb-4"><AuditItemSearch month={month} maxMonth={today.slice(0, 7)} itemName={itemName} /></div>}

      {tab === "overview" && (
        <OverviewTab period={period} sym={sym} tz={s.timezone} link={link} canMail={can(user, "mail.send")}
          mode={(["value", "quantity", "in", "out"].includes(sp.mode ?? "") ? sp.mode : "value") as DistMode}
          by={sp.by === "category" ? "category" : "item"} unit={sp.unit ?? null} />
      )}
      {tab === "item" && <ItemTab itemId={f.itemId} month={month} sym={sym} tz={s.timezone} />}
      {tab === "purchases" && <PurchasesTab r={pr} period={period} sym={sym} sort={sp.sort ?? "spend"} link={link} />}
      {tab === "stockout" && <StockOutTab r={pr} period={period} sym={sym} sort={sp.sort ?? "issues"} link={link} />}
      {tab === "prices" && <PricesTab r={pr} period={period} sym={sym} q={sp.q ?? null} dir={sp.dir === "up" || sp.dir === "down" ? sp.dir : "all"} pitem={sp.pitem ?? null} link={link} />}
      {tab === "usage" && <UsageTab r={{ from, to, tz: s.timezone }} f={f} sym={sym} group={group} spendBy={spendBy} link={link} />}
      {tab === "changes" && (
        <ChangesTab r={{ from, to, tz: s.timezone }} userId={/^[0-9a-f-]{36}$/i.test(sp.user ?? "") ? sp.user! : null} area={sp.area ?? null} page={Math.max(1, Number(sp.page ?? 1) || 1)} tz={s.timezone} />
      )}
    </div>
  );
}

const GROUP_LABEL: Record<Grouping, string> = { day: "Day", week: "Week", month: "Month" };

function periodName(p: string, g: Grouping, short = false) {
  const d = new Date(p + "T12:00:00Z");
  if (g === "month") return d.toLocaleDateString("en-GB", { month: short ? "short" : "long", year: short ? "2-digit" : "numeric", timeZone: "UTC" });
  if (g === "week") return `${short ? "" : "Week of "}${d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}`;
  return d.toLocaleDateString("en-GB", short ? { day: "numeric", month: "short", timeZone: "UTC" } : { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

async function UsageTab({ r, f, sym, group, spendBy, link }: {
  r: { from: string; to: string; tz: string }; f: { workerId: number | null; itemId: string | null; categoryId: number | null }; sym: string;
  group: Grouping; spendBy: SpendBy; link: (patch: Record<string, string | null>) => string;
}) {
  const [u, wi, people, cats, periods, spend] = await Promise.all([
    usageAnalysis(r, f), workerItems(r, f), userActivity(r), categoryUsage(r), moneyByPeriod(r, group, f), spendAnalysis(r, spendBy, f),
  ]);
  const m = (v: string | number) => formatMoney(v, sym);
  const total = Number(u.totals.value) || 1;
  const most = u.items[0];
  const least = u.items.length > 1 ? u.items[u.items.length - 1] : null;
  const byWorker = new Map<string, typeof wi>();
  for (const row of wi) byWorker.set(row.worker, [...(byWorker.get(row.worker) ?? []), row]);

  const inTotal = periods.reduce((a, p) => a + Number(p.in_value), 0);
  const outTotal = periods.reduce((a, p) => a + Number(p.out_value), 0);
  const maxBar = Math.max(1, ...periods.map((p) => Math.max(Number(p.in_value), Number(p.out_value))));
  const busiestIn = periods.reduce<PeriodMoney | null>((b, p) => (Number(p.in_value) > Number(b?.in_value ?? 0) ? p : b), null);
  const busiestOut = periods.reduce<PeriodMoney | null>((b, p) => (Number(p.out_value) > Number(b?.out_value ?? 0) ? p : b), null);
  const spent = Number(spend.spent);
  const topSpend = spend.rows[0];
  const word = GROUP_LABEL[group].toLowerCase();

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Money spent on stock" value={m(spend.spent)} sub={`${spend.receipts} purchase${spend.receipts === 1 ? "" : "s"}`} tone="text-[#2a78d6]" />
        <Kpi label="Value of stock used" value={m(u.totals.value)} sub={`taken ${u.totals.takes} time${u.totals.takes === 1 ? "" : "s"}`} tone="text-burgundy" />
        <Kpi label="Stock in − stock out" value={`${inTotal - outTotal >= 0 ? "+" : "−"}${m(Math.abs(inTotal - outTotal))}`} sub={inTotal - outTotal >= 0 ? "stock value grew" : "stock value fell"} />
        <Kpi label="Items · workers" value={`${u.totals.items} · ${u.totals.workers}`} sub="different items taken · workers" />
      </dl>

      {/* Amount stocked in / out per day, week or month */}
      <Panel
        title="Stock in and stock out amounts"
        actions={
          <div className="flex gap-1 rounded-full bg-white/70 p-1 ring-1 ring-white" role="tablist" aria-label="Group by">
            {(["day", "week", "month"] as Grouping[]).map((g) => (
              <Link key={g} href={link({ group: g === "day" ? null : g, range: g === "day" ? null : g === "week" ? "12w" : "12m", page: null })} scroll={false}
                role="tab" aria-selected={group === g}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold ${group === g ? "bg-night text-white" : "text-muted hover:text-ink"}`}>
                {GROUP_LABEL[g]}
              </Link>
            ))}
          </div>
        }
        bodyClass=""
      >
        <div className="grid grid-cols-2 gap-px border-b border-white/80 bg-white/60 sm:grid-cols-4">
          <MiniStat label="Total stocked in" value={m(inTotal)} dot="#2a78d6" />
          <MiniStat label="Total stocked out" value={m(outTotal)} dot="#9c2a45" />
          <MiniStat label={`Average in per ${word}`} value={m(periods.length ? inTotal / periods.length : 0)} />
          <MiniStat label={`Average out per ${word}`} value={m(periods.length ? outTotal / periods.length : 0)} />
        </div>
        <div className="px-5 pt-5 sm:px-6">
          <div className="flex h-48 items-end gap-[3px] sm:h-56" role="img" aria-label={`Amount stocked in and out per ${word}`}>
            {periods.map((p) => (
              <div key={p.period} className="group relative flex h-full min-w-0 flex-1 items-end justify-center gap-[1px]">
                <div className="w-1/2 max-w-5 rounded-t-[3px] bg-[#2a78d6]" style={{ height: `${Math.max(Number(p.in_value) ? 2 : 0, (Number(p.in_value) / maxBar) * 100)}%` }} />
                <div className="w-1/2 max-w-5 rounded-t-[3px] bg-[#9c2a45]" style={{ height: `${Math.max(Number(p.out_value) ? 2 : 0, (Number(p.out_value) / maxBar) * 100)}%` }} />
                <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-xl bg-night px-2.5 py-1.5 text-[11px] leading-snug text-white group-hover:block">
                  <strong>{periodName(p.period, group)}</strong><br />In {m(p.in_value)} · Out {m(p.out_value)}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[11px] text-muted">
            <span>{periods[0] ? periodName(periods[0].period, group, true) : ""}</span>
            <span className="flex gap-3">
              <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-[#2a78d6]" /> Stock in</span>
              <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-[#9c2a45]" /> Stock out</span>
            </span>
            <span>{periods.length ? periodName(periods[periods.length - 1].period, group, true) : ""}</span>
          </div>
          {(busiestIn || busiestOut) && (
            <p className="mt-3 text-sm text-muted">
              {busiestIn && <>Most stocked in: <strong className="text-ink">{periodName(busiestIn.period, group)}</strong> ({m(busiestIn.in_value)}). </>}
              {busiestOut && <>Most stocked out: <strong className="text-ink">{periodName(busiestOut.period, group)}</strong> ({m(busiestOut.out_value)}).</>}
            </p>
          )}
        </div>
        <p className="mt-4 px-5 text-xs text-muted sm:px-6">{GROUP_LABEL[group]}s with no stock movement are left out of the table.</p>
        <div className="mt-2 max-h-96 overflow-auto border-t border-white/80">
          <table className="w-full min-w-[620px] text-sm" data-testid="money-periods">
            <thead className="sticky top-0 z-[1] backdrop-blur"><tr className="text-left text-muted">
              <Th>{GROUP_LABEL[group]}</Th><Th right>Amount stocked in</Th><Th right>Amount stocked out</Th><Th right>Difference</Th><Th right>Receipts</Th><Th right>Issues</Th>
            </tr></thead>
            <tbody className="divide-y divide-white/80">
              {[...periods].reverse().filter((p) => p.in_count || p.out_count).map((p) => {
                const diff = Number(p.in_value) - Number(p.out_value);
                return (
                  <tr key={p.period}>
                    <Td><span className="whitespace-nowrap font-medium">{periodName(p.period, group)}</span></Td>
                    <Td right><span className="text-[#2a78d6]">{m(p.in_value)}</span></Td>
                    <Td right><span className="text-burgundy">{m(p.out_value)}</span></Td>
                    <Td right><span className={diff < 0 ? "text-bad" : ""}>{diff >= 0 ? "+" : "−"}{m(Math.abs(diff))}</span></Td>
                    <Td right>{p.in_count}</Td><Td right>{p.out_count}</Td>
                  </tr>
                );
              })}
              {!periods.some((p) => p.in_count || p.out_count) && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-sm text-muted">No stock moved in this period.</td></tr>
              )}
              <tr className="bg-white/50 font-semibold">
                <Td>Total</Td><Td right>{m(inTotal)}</Td><Td right>{m(outTotal)}</Td>
                <Td right>{inTotal - outTotal >= 0 ? "+" : "−"}{m(Math.abs(inTotal - outTotal))}</Td>
                <Td right>{periods.reduce((a, p) => a + p.in_count, 0)}</Td><Td right>{periods.reduce((a, p) => a + p.out_count, 0)}</Td>
              </tr>
            </tbody>
          </table>
        </div>
      </Panel>

      {/* How money is spent */}
      <Panel
        title="How money is spent"
        actions={
          <div className="flex gap-1 rounded-full bg-white/70 p-1 ring-1 ring-white" role="tablist" aria-label="Break down by">
            {([["item", "Items"], ["category", "Categories"], ["supplier", "Suppliers"]] as [SpendBy, string][]).map(([k, l]) => (
              <Link key={k} href={link({ spend: k === "item" ? null : k })} scroll={false} role="tab" aria-selected={spendBy === k}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold ${spendBy === k ? "bg-night text-white" : "text-muted hover:text-ink"}`}>
                {l}
              </Link>
            ))}
          </div>
        }
      >
        <PieChart
          big
          size={340}
          slices={moneySlices(spend.rows.map((x) => ({
            label: x.label, value: x.value, href: x.href,
            detail: `${x.qty ? `${formatQty(x.qty)} ${x.unit} · ` : ""}${m(x.value)} · ${x.count} purchase${x.count === 1 ? "" : "s"}`,
          })), sym)}
          centerLabel="Money spent"
          centerValue={m(spend.spent).replace(/\.00$/, "")}
          emptyText="No stock was bought in this period."
        />
        {spend.rows.length > 0 && (
          <>
            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Insight label={`Biggest spend (${spendBy})`} value={topSpend?.label ?? "—"} sub={topSpend ? `${m(topSpend.value)} · ${Math.round((Number(topSpend.value) / (spent || 1)) * 100)}% of all spending` : ""} />
              <Insight label="Average per purchase" value={m(spend.receipts ? spent / spend.receipts : 0)} sub={`${spend.receipts} purchases in this period`} />
              <Insight label="Spending vs usage" value={spent >= Number(u.totals.value) ? "Buying more than using" : "Using more than buying"}
                sub={`${m(spend.spent)} bought · ${m(u.totals.value)} used`} />
            </div>
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm" data-testid="spend-table">
                <thead><tr className="text-left text-muted"><Th>S/N</Th><Th>{spendBy === "item" ? "Item" : spendBy === "category" ? "Category" : "Supplier"}</Th>{spendBy === "item" && <Th right>Quantity bought</Th>}<Th right>Amount spent</Th><Th>Share</Th><Th right>Purchases</Th></tr></thead>
                <tbody className="divide-y divide-white/80">
                  {spend.rows.map((x, i) => {
                    const pct = (Number(x.value) / (spent || 1)) * 100;
                    return (
                      <tr key={x.key}>
                        <Td>{i + 1}</Td>
                        <Td>{x.href ? <Link href={x.href} className="font-semibold hover:text-burgundy">{x.label}</Link> : <span className="font-semibold">{x.label}</span>}</Td>
                        {spendBy === "item" && <Td right>{formatQty(x.qty ?? "0")} {x.unit}</Td>}
                        <Td right>{m(x.value)}</Td>
                        <Td><div className="flex items-center gap-2"><div className="h-1.5 w-24 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full bg-[#2a78d6]" style={{ width: `${pct}%` }} /></div><span className="text-xs text-muted">{pct.toFixed(pct < 1 ? 1 : 0)}%</span></div></Td>
                        <Td right>{x.count}</Td>
                      </tr>
                    );
                  })}
                  <tr className="bg-white/50 font-semibold"><Td /><Td>Total</Td>{spendBy === "item" && <Td />}<Td right>{m(spend.spent)}</Td><Td /><Td right>{spend.receipts}</Td></tr>
                </tbody>
              </table>
            </div>
          </>
        )}
        {Number(spend.opening) > 0 && (
          <p className="mt-3 text-xs text-muted">Opening stock entered when items were added ({m(spend.opening)}) isn&apos;t counted as spending.</p>
        )}
      </Panel>

      <Panel title="Most and least taken (value of stock used)">
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
          <PieChart big size={320} slices={toSlices(u.items, sym)} centerLabel="Value used" centerValue={m(u.totals.value).replace(/\.00$/, "")}
            emptyText="No stock was taken out in this period." />
          <div className="space-y-3">
            <Callout icon={<TrendingUp className="size-5" />} label="Most taken" dark item={most} m={m} />
            <Callout icon={<TrendingDown className="size-5" />} label="Least taken" item={least} m={m} />
            {u.neverTaken.length > 0 && (
              <div className="rounded-3xl bg-white/70 p-4 text-sm ring-1 ring-white">
                <p className="text-xs text-muted">Not taken at all ({u.neverTaken.length})</p>
                <p className="mt-1">{u.neverTaken.slice(0, 12).map((n) => n.name).join(", ")}{u.neverTaken.length > 12 ? "…" : ""}</p>
              </div>
            )}
          </div>
        </div>
      </Panel>

      <Panel title="Items taken, most to least" bodyClass="overflow-x-auto">
        {u.items.length ? (
          <table className="w-full min-w-[720px] text-sm">
            <thead><tr className="text-left text-muted"><Th>S/N</Th><Th>Item</Th><Th right>Quantity taken</Th><Th right>Value</Th><Th>Share</Th><Th right>Times</Th><Th right>Workers</Th></tr></thead>
            <tbody className="divide-y divide-white/80">
              {u.items.map((x, i) => {
                const pct = (Number(x.value) / total) * 100;
                return (
                  <tr key={x.item_id}>
                    <Td>{i + 1}</Td>
                    <Td><Link href={`/items/${x.item_id}`} className="font-semibold hover:text-burgundy">{x.name}</Link><span className="block text-xs text-muted">{x.category ?? "Uncategorised"}</span></Td>
                    <Td right>{formatQty(x.qty)} {x.unit}</Td>
                    <Td right>{m(x.value)}</Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full bg-burgundy" style={{ width: `${pct}%` }} /></div>
                        <span className="text-xs text-muted">{pct.toFixed(pct < 1 ? 1 : 0)}%</span>
                      </div>
                    </Td>
                    <Td right>{x.takes}</Td>
                    <Td right>{x.workers}</Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : <p className="p-6 text-sm text-muted">No stock was taken out in this period.</p>}
      </Panel>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <Panel title="Who took what" bodyClass="">
          {byWorker.size ? (
            <div className="divide-y divide-white/80">
              {Array.from(byWorker.entries()).map(([name, rows]) => {
                const wv = rows.reduce((a, x) => a + Number(x.value), 0);
                return (
                  <details key={name} className="group">
                    <summary className="flex cursor-pointer items-center justify-between gap-3 px-5 py-3 hover:bg-white/50 group-open:bg-white/60">
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">{name}</span>
                        <span className="text-xs text-muted">{rows.length} item{rows.length === 1 ? "" : "s"} · {(() => { const n = rows.reduce((a, x) => a + x.takes, 0); return `${n} time${n === 1 ? "" : "s"}`; })()}</span>
                      </span>
                      <span className="shrink-0 text-sm font-semibold">{m(wv)}</span>
                    </summary>
                    <ul className="space-y-1 px-5 pb-3">
                      {rows.map((x) => (
                        <li key={x.item} className="flex justify-between gap-3 rounded-xl bg-white/60 px-3 py-1.5 text-sm">
                          <span className="truncate">{x.item}</span>
                          <span className="shrink-0 text-muted">{formatQty(x.qty)} {x.unit} · {x.takes}× · {m(x.value)}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                );
              })}
            </div>
          ) : <p className="p-6 text-sm text-muted">No stock taken in this period.</p>}
        </Panel>

        <div className="space-y-4">
          <Panel title="Why stock left the store">
            {u.reasons.length ? (
              <ul className="space-y-2">
                {u.reasons.map((x) => {
                  const pct = (Number(x.value) / total) * 100;
                  return (
                    <li key={x.reason}>
                      <div className="flex justify-between text-sm"><span className="font-medium">{reasonLabel(x.reason)}</span><span className="text-muted">{x.takes}× · {m(x.value)}</span></div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full bg-night" style={{ width: `${pct}%` }} /></div>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="text-sm text-muted">Nothing yet.</p>}
          </Panel>
          <Panel title="Stock used by category">
            {cats.length ? (
              <ul className="space-y-1.5 text-sm">
                {cats.map((c) => (
                  <li key={c.category} className="flex justify-between rounded-xl bg-white/60 px-3 py-2"><span>{c.category}</span><span className="text-muted">{c.takes}× · <strong className="text-ink">{m(c.value)}</strong></span></li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted">Nothing yet.</p>}
          </Panel>
        </div>
      </div>

      <Panel title="Recorded by (staff accounts)">
        {people.length ? (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-muted"><th className="pb-2 font-medium">User</th><th className="pb-2 text-right font-medium">Stock in</th><th className="pb-2 text-right font-medium">Stock out</th><th className="pb-2 text-right font-medium">Corrections</th></tr></thead>
            <tbody className="divide-y divide-white/80">
              {people.map((p) => (
                <tr key={p.user_id ?? p.name}><td className="py-2 font-medium">{p.name}</td><td className="py-2 text-right">{p.ins}</td><td className="py-2 text-right">{p.outs}</td><td className="py-2 text-right">{p.corrections}</td></tr>
              ))}
            </tbody>
          </table>
        ) : <p className="text-sm text-muted">No activity in this period.</p>}
      </Panel>
      <p className="text-xs text-muted">Amounts use the cost recorded on each movement. Reversed transactions are left out. Every single movement is listed in <Link href="/transactions" className="font-semibold text-burgundy">Transactions</Link>.</p>
    </div>
  );
}

function MiniStat({ label, value, dot }: { label: string; value: string; dot?: string }) {
  return (
    <div className="bg-white/40 px-5 py-3">
      <p className="flex items-center gap-1.5 text-xs text-muted">{dot && <span className="size-2 rounded-full" style={{ background: dot }} />}{label}</p>
      <p className="mt-0.5 text-lg font-semibold tracking-tight">{value}</p>
    </div>
  );
}

function Insight({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-3xl bg-white/70 p-4 ring-1 ring-white">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 truncate text-base font-semibold">{value}</p>
      <p className="text-xs text-muted">{sub}</p>
    </div>
  );
}

async function ChangesTab({ r, userId, area, page, tz }: { r: { from: string; to: string; tz: string }; userId: string | null; area: string | null; page: number; tz: string }) {
  const { rows, total } = await auditEntries(r, { userId, area, limit: 50, offset: (page - 1) * 50 });
  return (
    <div className="glass overflow-hidden rounded-[var(--radius-card)]">
      <ul className="divide-y divide-white/80">
        {rows.map((e) => (
          <li key={e.id} className="flex gap-3 px-5 py-3 text-sm sm:px-6">
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-white text-xs font-bold text-burgundy shadow-sm">
              {(e.user_name ?? "S").slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p>
                <strong>{e.user_name ?? "System"}</strong> {(LABELS[e.action] ?? e.action).replace(/^./, (c) => c.toLowerCase())}
                {e.entity_label ? <> · <span className="font-medium">{e.entity_label}</span></> : null}
              </p>
              <p className="text-xs text-muted">{formatDateTime(e.created_at, tz)}</p>
              <Details d={e.details} />
            </div>
          </li>
        ))}
        {!rows.length && <li className="px-5 py-10 text-center text-sm text-muted">No changes in this period.</li>}
      </ul>
      <div className="border-t border-white/80"><Pagination page={page} pages={Math.max(1, Math.ceil(total / 50))} total={total} label="changes" /></div>
    </div>
  );
}

function Details({ d }: { d: Record<string, unknown> }) {
  const changes = d.changes as Record<string, { from: unknown; to: unknown }> | undefined;
  if (changes) {
    return (
      <ul className="mt-1.5 flex flex-wrap gap-1.5 text-xs">
        {Object.entries(changes).map(([k, v]) => (
          <li key={k} className="rounded-full bg-white/70 px-2.5 py-1 ring-1 ring-white">
            {k.replace(/_/g, " ")}: <span className="text-muted line-through">{String(v.from ?? "—")}</span> <span className="text-muted">to</span> <strong>{String(v.to ?? "—")}</strong>
          </li>
        ))}
      </ul>
    );
  }
  const keys = Object.entries(d).filter(([k, v]) => v !== null && v !== undefined && !["before", "after", "request_id"].includes(k));
  if (!keys.length) return null;
  return <p className="mt-1 truncate text-xs text-muted">{keys.map(([k, v]) => `${k.replace(/_/g, " ")}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`).join(" · ")}</p>;
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="glass rounded-[var(--radius-card)] p-4">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`mt-2 truncate text-xl font-semibold tracking-tight sm:text-2xl ${tone ?? ""}`}>{value}</dd>
      {sub && <dd className="text-xs text-muted">{sub}</dd>}
    </div>
  );
}

function Callout({ icon, label, item, m, dark }: { icon: React.ReactNode; label: string; dark?: boolean; m: (v: string) => string; item: { item_id: string; name: string; qty: string; unit: string; value: string; takes: number } | null | undefined }) {
  return (
    <div className={`rounded-3xl p-4 ${dark ? "bg-night text-white" : "bg-white/80 ring-1 ring-white"}`}>
      <p className="flex items-center gap-2 text-xs opacity-70">{icon} {label}</p>
      {item ? (
        <>
          <Link href={`/items/${item.item_id}`} className="mt-2 block truncate text-lg font-semibold hover:underline">{item.name}</Link>
          <p className="text-sm opacity-75">{formatQty(item.qty)} {item.unit} · {m(item.value)} · {item.takes}×</p>
        </>
      ) : <p className="mt-2 text-sm opacity-70">Not enough stock-outs yet.</p>}
    </div>
  );
}

const Th = ({ children, right }: { children?: React.ReactNode; right?: boolean }) => (
  <th className={`whitespace-nowrap border-b border-white/80 bg-white/40 px-4 py-2.5 font-semibold ${right ? "text-right" : ""}`}>{children}</th>
);
const Td = ({ children, right }: { children?: React.ReactNode; right?: boolean }) => (
  <td className={`px-4 py-2.5 align-top ${right ? "whitespace-nowrap text-right" : ""}`}>{children}</td>
);
