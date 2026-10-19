import { PageHeader } from "@/components/ui/primitives";
import { UsersManager } from "@/components/users-manager";
import { requirePageUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { listCategories } from "@/lib/catalog";
import { getSettings } from "@/lib/settings";
import { formatDateTime } from "@/lib/format";
import type { Role } from "@/lib/permissions";

export const metadata = { title: "User Management" };

export default async function UsersPage() {
  const me = await requirePageUser("users.manage");
  const s = await getSettings();
  const users = await query<{ id: string; name: string; email: string; role: Role; is_active: boolean; last_login_at: string | null; permissions: string[] | null; allowed_category_ids: number[] | null }>(
    "SELECT id, name, email, role, is_active, last_login_at, permissions, allowed_category_ids FROM users ORDER BY is_active DESC, created_at",
  );
  const categories = await listCategories();
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="User Management" description="Give each staff member their own sign-in so every stock movement shows who recorded it." />
      <UsersManager
        meId={me.id}
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        users={users.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, is_active: u.is_active, last_login: u.last_login_at ? formatDateTime(u.last_login_at, s.timezone) : null,
          permissions: u.permissions, allowed_category_ids: u.allowed_category_ids }))}
      />
    </div>
  );
}
