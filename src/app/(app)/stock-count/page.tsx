import Link from "next/link";
import { PageHeader, Panel } from "@/components/ui/primitives";
import { CountDecision, CountForm } from "@/components/count-manager";
import { requirePageUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { countsInRange } from "@/lib/audit-analytics";
import { getSettings } from "@/lib/settings";
import { addDays, formatDateTime, formatMoney, formatQty, todayIn } from "@/lib/format";

export const metadata = { title: "Stock Count" };

export default async function StockCountPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const user = await requirePageUser("stock.count");
  const sp = await searchParams;
  const s = await getSettings();
  const today = todayIn(s.timezone);
  const days = [7, 30, 90, 365].includes(Number(sp.days)) ? Number(sp.days) : 30;
  const r = { from: addDays(today, -(days - 1)), to: today, tz: s.timezone };
  const [pending, history] = await Promise.all([countsInRange({ ...r, from: "2000-01-01" }, "pending"), countsInRange(r)]);
  const decided = history.filter((x) => x.status !== "pending");
  const m = (v: string | number) => formatMoney(v, s.currency_symbol);
  const canApprove = can(user, "count.approve");
  const shortage = decided.filter((x) => x.status === "approved" && Number(x.difference) < 0).reduce((a, x) => a + Number(x.value_difference), 0);
  const excess = decided.filter((x) => x.status === "approved" && Number(x.difference) > 0).reduce((a, x) => a + Number(x.value_difference), 0);

  return (
    <div>
      <PageHeader title="Stock Count" description="Count what is physically on the shelf. Differences are posted as shortages or excesses once approved." />
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Panel title="Record a count"><CountForm symbol={s.currency_symbol} /></Panel>
        <Panel title={`Waiting for approval (${pending.length})`} bodyClass="">
          {pending.length ? (
            <ul className="divide-y divide-white/80" data-testid="pending-counts">
              {pending.map((c) => {
                const d = Number(c.difference);
                return (
                  <li key={c.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-semibold">{c.item_name} <span className="text-xs font-normal text-muted">{c.count_no}</span></p>
                      <p className="text-xs text-muted">
                        System {formatQty(c.system_qty)} · counted {formatQty(c.counted_qty)} {c.unit} ·{" "}
                        <span className={d < 0 ? "font-semibold text-bad" : d > 0 ? "font-semibold text-sky-700" : "text-ok"}>
                          {d < 0 ? `short ${formatQty(c.difference.slice(1))}` : d > 0 ? `excess ${formatQty(c.difference)}` : "matches"} ({m(c.value_difference)})
                        </span>
                      </p>
                      <p className="text-xs text-muted">{formatDateTime(c.counted_at, s.timezone)} by {c.counted_by ?? "—"}{c.notes ? ` · ${c.notes}` : ""}</p>
                    </div>
                    {canApprove ? (
                      <CountDecision id={c.id} countNo={c.count_no}
                        summary={`${c.item_name}: system ${formatQty(c.system_qty)} ${c.unit}, counted ${formatQty(c.counted_qty)} ${c.unit} (${d < 0 ? "shortage" : d > 0 ? "excess" : "no difference"} of ${m(c.value_difference)}).`} />
                    ) : <span className="text-xs text-muted">Waiting for the owner</span>}
                  </li>
                );
              })}
            </ul>
          ) : <p className="p-6 text-sm text-muted">No counts waiting.</p>}
        </Panel>
      </div>

      <Panel className="mt-4" bodyClass="overflow-x-auto"
        title={<span>Count history · <span className="text-bad">shortages {m(-shortage)}</span> · <span className="text-sky-700">excess {m(excess)}</span></span>}
        actions={
          <div className="flex gap-1 rounded-full bg-white/70 p-1 ring-1 ring-white">
            {[7, 30, 90, 365].map((d) => (
              <Link key={d} href={`/stock-count?days=${d}`} scroll={false} className={`rounded-full px-3 py-1 text-xs font-semibold transition ${days === d ? "bg-night text-white" : "text-muted hover:text-ink"}`}>{d === 365 ? "1 year" : `${d} days`}</Link>
            ))}
          </div>
        }>
        {decided.length ? (
          <table className="w-full min-w-[820px] text-sm">
            <thead><tr className="text-left text-muted">
              {["Count", "Item", "System", "Counted", "Difference", "Value", "Status", "Approval", "Adjustment"].map((h, i) => (
                <th key={h} className={`border-b border-white/80 bg-white/40 px-4 py-2.5 font-semibold ${i >= 2 && i <= 5 ? "text-right" : ""}`}>{h}</th>
              ))}
            </tr></thead>
            <tbody className="divide-y divide-white/80">
              {decided.map((c) => {
                const d = Number(c.difference);
                return (
                  <tr key={c.id}>
                    <td className="px-4 py-2.5">{c.count_no}<span className="block text-xs text-muted">{formatDateTime(c.counted_at, s.timezone)}</span></td>
                    <td className="px-4 py-2.5 font-semibold">{c.item_name}<span className="block text-xs font-normal text-muted">by {c.counted_by ?? "—"}</span></td>
                    <td className="px-4 py-2.5 text-right">{formatQty(c.system_qty)} {c.unit}</td>
                    <td className="px-4 py-2.5 text-right">{formatQty(c.counted_qty)} {c.unit}</td>
                    <td className={`px-4 py-2.5 text-right font-semibold ${d < 0 ? "text-bad" : d > 0 ? "text-sky-700" : "text-ok"}`}>{d > 0 ? "+" : ""}{formatQty(c.difference)}</td>
                    <td className="px-4 py-2.5 text-right">{m(c.value_difference)}</td>
                    <td className="px-4 py-2.5"><span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${c.status === "approved" ? "bg-ok-bg text-ok" : "bg-white text-muted ring-1 ring-line"}`}>{c.status === "approved" ? "Approved" : "Rejected"}</span></td>
                    <td className="px-4 py-2.5 text-xs">{c.decided_by ?? "—"}{c.decided_at ? <span className="block text-muted">{formatDateTime(c.decided_at, s.timezone)}</span> : null}{c.decision_note ? <span className="block text-muted">{c.decision_note}</span> : null}</td>
                    <td className="px-4 py-2.5 text-xs">{c.txn_no ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : <p className="p-6 text-sm text-muted">No decided counts in this period.</p>}
      </Panel>
    </div>
  );
}
