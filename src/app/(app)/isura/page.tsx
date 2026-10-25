import { PageHeader } from "@/components/ui/primitives";
import { requirePlatformAdmin } from "@/lib/auth";
import { listBusinesses, paystackKey } from "@/lib/businesses";
import { publicBaseUrl } from "@/lib/mailer";
import { query, queryOne, withStore } from "@/lib/db";
import { IsuraAdmin } from "./admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "ÌṢÚRA admin" };

export default async function IsuraAdminPage() {
  const me = await requirePlatformAdmin("page");
  const [list, key, payments] = await Promise.all([
    listBusinesses(),
    paystackKey(),
    withStore(null, () => query<{ store_id: number; reference: string; amount_kobo: string; months: number; method: string; paid_at: string }>(
      "SELECT store_id, reference, amount_kobo::text, months, method, paid_at::text FROM payments WHERE status = 'success' ORDER BY paid_at DESC LIMIT 20")),
  ]);
  const businesses = await Promise.all(list.map(async (b) => {
    const c = await withStore(b.id, () => queryOne<{ items: number; users: number; owners: string | null; last: string | null }>(
      `SELECT (SELECT count(*)::int FROM items WHERE archived_at IS NULL) AS items,
              (SELECT count(*)::int FROM users WHERE store_id = current_store() AND deleted_at IS NULL AND NOT is_platform_admin) AS users,
              (SELECT string_agg(CASE WHEN is_platform_admin THEN name || ' (you)' ELSE name || ' (' || email || ')' END, ', ' ORDER BY is_platform_admin DESC) FROM users WHERE store_id = current_store() AND (role = 'owner' OR is_platform_admin) AND deleted_at IS NULL) AS owners,
              (SELECT max(created_at)::text FROM stock_transactions) AS last`));
    const pending = await withStore(null, () => query<{ email: string; role: string; expires_at: string }>(
      "SELECT email, role, expires_at::text FROM store_invites WHERE store_id = $1 AND accepted_at IS NULL AND expires_at > now() ORDER BY created_at DESC LIMIT 3", [b.id]));
    return { ...b, ...c!, pending };
  }));
  return (
    <div>
      <PageHeader title="ÌṢÚRA admin" description="Your businesses, their subscriptions and who owns them. Only you can see this page." />
      <IsuraAdmin
        businesses={businesses}
        payments={payments}
        activeStoreId={me.store_id}
        paystack={key ? { mode: key.startsWith("sk_live_") ? "live" : "test", ending: key.slice(-4) } : null}
        webhookUrl={`${publicBaseUrl()}/api/paystack/webhook`}
      />
    </div>
  );
}
