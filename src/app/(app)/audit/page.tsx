import { PageHeader } from "@/components/ui/primitives";
import { Pagination } from "@/components/list-filters";
import { requirePageUser } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Audit Log" };

const LABELS: Record<string, string> = {
  "item.create": "Added item", "item.update": "Edited item", "item.archive": "Archived item", "item.restore": "Restored item",
  "item.conversion.set": "Set unit conversion", "item.conversion.remove": "Removed unit conversion",
  "transaction.reverse": "Reversed transaction", "settings.update": "Changed settings",
  "user.create": "Added user", "user.update": "Changed user", "category.create": "Added category", "category.update": "Changed category",
  "supplier.create": "Added supplier", "supplier.update": "Changed supplier", "supplier.archive": "Archived supplier", "supplier.restore": "Restored supplier",
  "unit.create": "Added unit", "unit_conversion.set": "Set conversion rule", "unit_conversion.remove": "Removed conversion rule",
  "setup.owner_created": "Created owner account",
};

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  await requirePageUser("audit.view");
  const page = Math.max(1, Number((await searchParams).page ?? 1) || 1);
  const s = await getSettings();
  const rows = await query<{ id: string; action: string; entity_type: string; entity_id: string | null; details: Record<string, unknown>; created_at: string; user_name: string | null; entity_label: string | null }>(
    `SELECT a.id::text, a.action, a.entity_type, a.entity_id, a.details, a.created_at, u.name AS user_name,
            CASE WHEN a.entity_type = 'item' THEN (SELECT name || ' (' || sku || ')' FROM items WHERE id::text = a.entity_id)
                 WHEN a.entity_type = 'stock_transaction' THEN (SELECT txn_no FROM stock_transactions WHERE id::text = a.entity_id)
                 WHEN a.entity_type = 'user' THEN (SELECT name FROM users WHERE id::text = a.entity_id) END AS entity_label
       FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
      ORDER BY a.created_at DESC, a.id DESC LIMIT 50 OFFSET $1`,
    [(page - 1) * 50],
  );
  const total = (await queryOne<{ n: number }>("SELECT count(*)::int AS n FROM audit_logs"))?.n ?? 0;

  return (
    <div>
      <PageHeader title="Audit Log" description="Important changes to items, settings, users and corrections. Stock movements themselves are in Transactions." />
      <div className="overflow-hidden rounded-lg border border-line bg-white">
        <ul className="divide-y divide-line">
          {rows.map((r) => (
            <li key={r.id} className="px-4 py-3 text-sm sm:px-5">
              <p>
                <strong>{r.user_name ?? "System"}</strong> · {LABELS[r.action] ?? r.action}
                {r.entity_label ? <> · <span className="font-medium">{r.entity_label}</span></> : null}
              </p>
              <p className="text-xs text-muted">{formatDateTime(r.created_at, s.timezone)}</p>
              <Details d={r.details} />
            </li>
          ))}
          {!rows.length && <li className="px-5 py-10 text-center text-sm text-muted">No activity yet.</li>}
        </ul>
        <div className="border-t border-line"><Pagination page={page} pages={Math.max(1, Math.ceil(total / 50))} total={total} label="entries" /></div>
      </div>
    </div>
  );
}

function Details({ d }: { d: Record<string, unknown> }) {
  const changes = d.changes as Record<string, { from: unknown; to: unknown }> | undefined;
  if (changes) {
    return (
      <ul className="mt-1 text-xs text-muted">
        {Object.entries(changes).map(([k, v]) => (
          <li key={k}>{k.replace(/_/g, " ")}: {String(v.from ?? "—")} → {String(v.to ?? "—")}</li>
        ))}
      </ul>
    );
  }
  const keys = Object.entries(d).filter(([k, v]) => v !== null && v !== undefined && !["before", "after", "request_id"].includes(k));
  if (!keys.length) return null;
  return <p className="mt-1 truncate text-xs text-muted">{keys.map(([k, v]) => `${k.replace(/_/g, " ")}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`).join(" · ")}</p>;
}
