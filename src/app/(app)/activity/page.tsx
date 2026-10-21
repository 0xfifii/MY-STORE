import Link from "next/link";
import { ClipboardCheck, FileText, KeyRound, Mail, Package, Settings, Tags, Undo2, Users } from "@/components/hand-icons";
import { StockInIcon, StockOutIcon } from "@/components/icons";
import { EmptyState, PageHeader, Panel } from "@/components/ui/primitives";
import { Pagination } from "@/components/list-filters";
import { UrlSelect } from "@/components/url-select";
import { requirePageUser } from "@/lib/auth";
import { activityFeed, KIND_LABELS, markActivitySeen, type ActivityKind } from "@/lib/activity";
import { can } from "@/lib/permissions";
import { query, queryOne } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { addDays, formatMoney, todayIn } from "@/lib/format";

export const metadata = { title: "Activity" };

type SP = { user?: string; kind?: string; day?: string; page?: string };
const UUID = /^[0-9a-f-]{36}$/i;
const D = /^\d{4}-\d{2}-\d{2}$/;

const ICON: Record<ActivityKind, React.ComponentType<{ className?: string }>> = {
  stock_in: StockInIcon, stock_out: StockOutIcon, correction: Undo2, count: ClipboardCheck, item: Package, setup: Tags,
  email: Mail, report: FileText, user: Users, settings: Settings, signin: KeyRound,
};

export default async function ActivityPage({ searchParams }: { searchParams: Promise<SP> }) {
  const me = await requirePageUser("view");
  const sp = await searchParams;
  const s = await getSettings();
  const everyone = can(me, "activity.view");
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const pageSize = 50;
  const kind = sp.kind && sp.kind in KIND_LABELS ? sp.kind : null;
  const day = sp.day && D.test(sp.day) ? sp.day : null;

  const [seen, people, feed] = await Promise.all([
    queryOne<{ at: string | null }>("SELECT activity_seen_at::text AS at FROM users WHERE id = $1", [me.id]),
    everyone ? query<{ id: string; name: string; is_active: boolean }>("SELECT id, name, is_active FROM users ORDER BY is_active DESC, name") : Promise.resolve([]),
    activityFeed({
      userId: everyone && sp.user && UUID.test(sp.user) ? sp.user : null,
      onlyUserId: everyone ? null : me.id,
      kind, day, tz: s.timezone, limit: pageSize, offset: (page - 1) * pageSize,
    }),
  ]);
  if (everyone) await markActivitySeen(me.id);
  const seenAt = seen?.at ? new Date(seen.at).getTime() : 0;

  const today = todayIn(s.timezone);
  const dayOf = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: s.timezone });
  const dayTitle = (d: string) => d === today ? "Today" : d === addDays(today, -1) ? "Yesterday"
    : new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const time = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: s.timezone });
  const groups: { day: string; rows: typeof feed.rows }[] = [];
  for (const r of feed.rows) {
    const d = dayOf(r.at);
    if (groups.at(-1)?.day !== d) groups.push({ day: d, rows: [] });
    groups.at(-1)!.rows.push(r);
  }
  const fresh = everyone ? feed.rows.filter((r) => r.user_id !== me.id && r.kind !== "signin" && new Date(r.at).getTime() > seenAt).length : 0;
  const initials = (n: string | null) => (n ?? "?").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const dayOptions = Array.from({ length: 14 }, (_, i) => addDays(today, -i)).map((d) => ({ value: d, label: dayTitle(d) }));

  return (
    <div>
      <PageHeader
        title="Activity"
        description={everyone
          ? "Everything people do in the app, newest first. New activity shows on the bell in the menu."
          : "Everything you have done in the app, newest first."}
      />
      <div className="mb-4 grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
        {everyone && <UrlSelect name="user" label="Person" allLabel="Everyone" options={people.map((p) => ({ value: p.id, label: p.name + (p.is_active ? "" : " (deactivated)") }))} />}
        <UrlSelect name="kind" label="Type of activity" allLabel="All activity" options={Object.entries(KIND_LABELS).map(([value, label]) => ({ value, label }))} />
        <UrlSelect name="day" label="Day" allLabel="Any day" options={dayOptions} />
      </div>
      {fresh > 0 && (
        <p className="mb-3 inline-flex items-center gap-2 rounded-xl bg-burgundy px-3 py-1.5 text-sm font-semibold text-paper" data-testid="activity-new">
          <span className="size-2 rounded-full bg-gold" aria-hidden /> {fresh} new since you last looked
        </p>
      )}
      <Panel>
        {groups.length ? (
          <div className="space-y-6" data-testid="activity-feed">
            {groups.map((g) => (
              <section key={g.day}>
                <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-burgundy/60">{dayTitle(g.day)}</h2>
                <ol className="relative space-y-1 before:absolute before:bottom-3 before:left-[1.35rem] before:top-3 before:w-px before:bg-burgundy/15">
                  {g.rows.map((r) => {
                    const Icon = ICON[r.kind] ?? Tags;
                    const isNew = everyone && r.user_id !== me.id && r.kind !== "signin" && new Date(r.at).getTime() > seenAt;
                    const body = (
                      <>
                        <span className="relative z-[1] flex size-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-burgundy to-claret text-xs font-bold text-paper">
                          {initials(r.user_name)}
                          <span className="absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-lg bg-paper text-burgundy ring-2 ring-paper"><Icon className="size-3.5" /></span>
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm leading-snug">
                            <strong className="font-semibold">{r.user_id === me.id ? "You" : r.user_name ?? "Someone"}</strong>{" "}
                            <span className="text-ink/85">{r.title.charAt(0).toLowerCase() + r.title.slice(1)}</span>
                            {r.value && Number(r.value) > 0 && <span className="text-muted"> · {formatMoney(r.value, s.currency_symbol)}</span>}
                          </span>
                          {r.detail && <span className="mt-0.5 block truncate text-xs text-muted">{r.detail}</span>}
                        </span>
                        <span className="flex shrink-0 flex-col items-end gap-1">
                          <span className="text-xs tabular-nums text-muted">{time(r.at)}</span>
                          {isNew && <span className="rounded-md bg-burgundy px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-paper">New</span>}
                        </span>
                      </>
                    );
                    const cls = `flex items-start gap-3 rounded-2xl px-2 py-2 transition-colors ${isNew ? "bg-burgundy/[0.05]" : ""}`;
                    return (
                      <li key={r.key}>
                        {r.href ? <Link href={r.href} className={`${cls} hover:bg-burgundy/[0.06]`}>{body}</Link> : <div className={cls}>{body}</div>}
                      </li>
                    );
                  })}
                </ol>
              </section>
            ))}
          </div>
        ) : (
          <EmptyState title="Nothing here yet" body={kind || day || sp.user ? "No activity matches these filters." : "Activity appears here as soon as people start using the app."} />
        )}
      </Panel>
      <div className="mt-3"><Pagination page={page} pages={Math.max(1, Math.ceil(feed.total / pageSize))} total={feed.total} label="activities" /></div>
    </div>
  );
}
