import { PageHeader } from "@/components/ui/primitives";
import { UsersManager } from "@/components/users-manager";
import { requirePageUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { listCategories } from "@/lib/catalog";
import { getSettings } from "@/lib/settings";
import { formatDateTime } from "@/lib/format";
import type { Role } from "@/lib/permissions";
import { smtpConfigured } from "@/lib/mailer";
import Link from "next/link";

export const metadata = { title: "User Management" };

export default async function UsersPage() {
  const me = await requirePageUser("users.manage");
  const s = await getSettings();
  const users = await query<{ id: string; name: string; email: string; role: Role; is_active: boolean; last_login_at: string | null; permissions: string[] | null; allowed_category_ids: number[] | null }>(
    "SELECT id, name, email, role, is_active, last_login_at, permissions, allowed_category_ids FROM users ORDER BY is_active DESC, created_at",
  );
  const [categories, mailReady, welcome] = await Promise.all([
    listCategories(),
    smtpConfigured(),
    query<{ user_id: string; status: string; sent_at: string; error: string | null }>(
      `SELECT DISTINCT ON (payload->'attach'->>'userId') payload->'attach'->>'userId' AS user_id, status, sent_at, error
         FROM email_log WHERE kind = 'welcome' AND payload->'attach'->>'userId' IS NOT NULL
        ORDER BY payload->'attach'->>'userId', sent_at DESC`,
    ),
  ]);
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="User Management" description="Give each staff member their own sign-in so every stock movement shows who recorded it." />
      {!mailReady && (
        <div className="mb-4 rounded-3xl bg-warn-bg px-4 py-3 text-sm text-warn ring-1 ring-white">
          <strong>Welcome emails can&apos;t be delivered yet.</strong> The app has no email account to send from.{" "}
          <Link href="/settings#email" className="font-semibold underline">Add it in Store Settings</Link>, then use <strong>Send welcome email</strong> on each person below.
        </div>
      )}
      <UsersManager
        meId={me.id}
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        users={users.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, is_active: u.is_active, last_login: u.last_login_at ? formatDateTime(u.last_login_at, s.timezone) : null,
          permissions: u.permissions, allowed_category_ids: u.allowed_category_ids,
          welcome: (() => { const w = welcome.find((x) => x.user_id === u.id); return w ? { status: w.status, at: formatDateTime(w.sent_at, s.timezone), error: w.error } : null; })() }))}
        mailReady={mailReady}
      />
    </div>
  );
}
