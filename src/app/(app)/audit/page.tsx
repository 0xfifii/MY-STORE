import Link from "next/link";
import { Download, TrendingDown, TrendingUp } from "lucide-react";
import { PageHeader, Panel } from "@/components/ui/primitives";
import { PieChart } from "@/components/pie-chart";
import { Pagination } from "@/components/list-filters";
import { UsageFilters } from "@/components/usage-filters";
import { requirePageUser } from "@/lib/auth";
import { auditEntries, categoryUsage, dailyMovement, toSlices, usageAnalysis, userActivity, workerItems } from "@/lib/analytics";
import { listCategories, listWorkers } from "@/lib/catalog";
import { query } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { addDays, formatDate, formatDateTime, formatMoney, formatQty, reasonLabel, todayIn } from "@/lib/format";

export const metadata = { title: "Usage & Audit" };

const D = /^\d{4}-\d{2}-\d{2}$/;

const LABELS: Record<string, string> = {
  "item.create": "Added item", "item.update": "Edited item", "item.archive": "Archived item", "item.restore": "Restored item",
  "item.conversion.set": "Set unit conversion", "item.conversion.remove": "Removed unit conversion",
  "transaction.reverse": "Reversed a transaction", "settings.update": "Changed store settings",
  "user.create": "Added user", "user.update": "Changed user", "user.permissions": "Changed user permissions",
  "category.create": "Added category", "category.update": "Changed category",
  "supplier.create": "Added supplier", "supplier.update": "Changed supplier", "supplier.archive": "Archived supplier", "supplier.restore": "Restored supplier",
  "worker.create": "Added worker", "worker.update": "Changed worker", "worker.archive": "Archived worker", "worker.restore": "Restored worker",
  "unit.create": "Added unit", "unit_conversion.set": "Set conversion rule", "unit_conversion.remove": "Removed conversion rule",
  "setup.owner_created": "Created owner account",
};

type SP = { tab?: string; range?: string; from?: string; to?: string; worker?: string; item?: string; category?: string; user?: string; area?: string; page?: string };

export default async function AuditPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requirePageUser("audit.view");
  const sp = await searchParams;
  const s = await getSettings();
  const sym = s.currency_symbol;
  const today = todayIn(s.timezone);
  const presets: Record<string, [string, string]> = {
    "7": [addDays(today, -6), today],
    "30": [addDays(today, -29), today],
    "90": [addDays(today, -89), today],
    month: [today.slice(0, 8) + "01", today],
  };
  let [from, to] = presets[sp.range ?? "30"] ?? presets["30"];
  if (sp.range === "custom" && sp.from && D.test(sp.from)) { from = sp.from; to = sp.to && D.test(sp.to) ? sp.to : today; }
  if (to < from) [from, to] = [to, from];
  const r = { from, to, tz: s.timezone };
  const f = {
    workerId: /^\d+$/.test(sp.worker ?? "") ? Number(sp.worker) : null,
    itemId: /^[0-9a-f-]{36}$/i.test(sp.item ?? "") ? sp.item! : null,
    categoryId: /^\d+$/.test(sp.category ?? "") ? Number(sp.category) : null,
  };
  const tab = sp.tab === "changes" ? "changes" : "usage";
  const page = Math.max(1, Number(sp.page ?? 1) || 1);

  const [workers, categories, items, users] = await Promise.all([
    listWorkers(true), listCategories(), query<{ id: string; name: string }>("SELECT id, name FROM items ORDER BY lower(name)"),
    query<{ id: string; name: string }>("SELECT id, name FROM users ORDER BY name"),
  ]);
  const qs = new URLSearchParams(Object.entries({ ...sp, tab: undefined, page: undefined }).filter(([, v]) => v) as [string, string][]);

  return (
    <div>
      <PageHeader
        title="Usage & Audit"
        description={`${formatDate(from)} – ${formatDate(to)} · how items were used in the store and every change made`}
        actions={tab === "usage" ? (
          <a href={`/api/usage/export?from=${from}&to=${to}${f.workerId ? `&worker=${f.workerId}` : ""}${f.itemId ? `&item=${f.itemId}` : ""}${f.categoryId ? `&category=${f.categoryId}` : ""}`}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-night px-5 text-sm font-semibold text-white hover:bg-claret">
            <Download className="size-4" /> Download analysis
          </a>
        ) : undefined}
      />

      <div className="mb-4 flex gap-1.5 rounded-full bg-white/60 p-1 ring-1 ring-white sm:w-fit">
        {[["usage", "Usage analysis"], ["changes", "Change log"]].map(([k, l]) => (
          <Link key={k} href={`/audit?${new URLSearchParams({ ...Object.fromEntries(qs), tab: k })}`}
            className={`flex-1 rounded-full px-5 py-2 text-center text-sm font-semibold sm:flex-none ${tab === k ? "bg-night text-white" : "text-muted hover:text-ink"}`}>
            {l}
          </Link>
        ))}
      </div>

      <UsageFilters
        tab={tab}
        workers={workers.map((w) => ({ value: String(w.id), label: w.name }))}
        items={items.map((i) => ({ value: i.id, label: i.name }))}
        categories={categories.map((c) => ({ value: String(c.id), label: c.name }))}
        users={users.map((u) => ({ value: u.id, label: u.name }))}
      />

      {tab === "usage" ? (
        <UsageTab r={r} f={f} sym={sym} />
      ) : (
        <ChangesTab r={r} userId={/^[0-9a-f-]{36}$/i.test(sp.user ?? "") ? sp.user! : null} area={sp.area ?? null} page={page} tz={s.timezone} />
      )}
    </div>
  );
}

async function UsageTab({ r, f, sym }: { r: { from: string; to: string; tz: string }; f: { workerId: number | null; itemId: string | null; categoryId: number | null }; sym: string }) {
  const [u, wi, days, people, cats] = await Promise.all([
    usageAnalysis(r, f), workerItems(r, f), dailyMovement(r), userActivity(r), categoryUsage(r),
  ]);
  const m = (v: string | number) => formatMoney(v, sym);
  const total = Number(u.totals.value) || 1;
  const most = u.items[0];
  const least = u.items.length > 1 ? u.items[u.items.length - 1] : null;
  const maxDay = Math.max(1, ...days.map((d) => Number(d.out_value)));
  const byWorker = new Map<string, typeof wi>();
  for (const row of wi) byWorker.set(row.worker, [...(byWorker.get(row.worker) ?? []), row]);

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Value taken" value={m(u.totals.value)} />
        <Kpi label="Times stock was taken" value={String(u.totals.takes)} />
        <Kpi label="Different items" value={String(u.totals.items)} />
        <Kpi label="Workers involved" value={String(u.totals.workers)} />
      </dl>

      <Panel title="Most and least taken">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <PieChart slices={toSlices(u.items, sym)} centerLabel="Value taken" centerValue={m(u.totals.value).replace(/\.00$/, "")}
            emptyText="No stock was taken out in this period." size={220} />
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
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 hover:bg-white/50">
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">{name}</span>
                        <span className="text-xs text-muted">{rows.length} item{rows.length === 1 ? "" : "s"} · {(() => { const n = rows.reduce((a, x) => a + x.takes, 0); return `${n} time${n === 1 ? "" : "s"}`; })()}</span>
                      </span>
                      <span className="shrink-0 text-sm font-semibold">{m(wv)} <span className="ml-1 inline-block text-muted transition-transform group-open:rotate-90">›</span></span>
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
          <Panel title="Stock out per day">
            <div className="flex h-36 items-end gap-[2px]" role="img" aria-label="Value of stock taken out per day">
              {days.map((d) => (
                <div key={d.day} className="group relative flex h-full flex-1 items-end">
                  <div className="w-full rounded-t-[3px] bg-burgundy/80 hover:bg-burgundy" style={{ height: `${Math.max(Number(d.out_value) ? 3 : 0, (Number(d.out_value) / maxDay) * 100)}%` }} />
                  <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-night px-2 py-1 text-[11px] text-white group-hover:block">
                    {formatDate(d.day)} · {m(d.out_value)} · {d.out_count}×
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-2 flex justify-between text-[11px] text-muted"><span>{formatDate(days[0]?.day ?? r.from)}</span><span>{formatDate(days[days.length - 1]?.day ?? r.to)}</span></div>
          </Panel>

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
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="By category">
          {cats.length ? (
            <ul className="space-y-1.5 text-sm">
              {cats.map((c) => (
                <li key={c.category} className="flex justify-between rounded-xl bg-white/60 px-3 py-2"><span>{c.category}</span><span className="text-muted">{c.takes}× · <strong className="text-ink">{m(c.value)}</strong></span></li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted">Nothing yet.</p>}
        </Panel>
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
      </div>
      <p className="text-xs text-muted">Values use the cost recorded on each stock out. Reversed transactions are left out. Every single movement is listed in <Link href="/transactions" className="font-semibold text-burgundy">Transactions</Link>.</p>
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
            {k.replace(/_/g, " ")}: <span className="text-muted line-through">{String(v.from ?? "—")}</span> → <strong>{String(v.to ?? "—")}</strong>
          </li>
        ))}
      </ul>
    );
  }
  const keys = Object.entries(d).filter(([k, v]) => v !== null && v !== undefined && !["before", "after", "request_id"].includes(k));
  if (!keys.length) return null;
  return <p className="mt-1 truncate text-xs text-muted">{keys.map(([k, v]) => `${k.replace(/_/g, " ")}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`).join(" · ")}</p>;
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass rounded-[var(--radius-card)] p-4">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-2 text-2xl font-semibold tracking-tight">{value}</dd>
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
