import { handle, ok, readJson } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { queryOne } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { TOGGLEABLE } from "@/lib/permissions";
import { userPermissionsSchema } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

/** Owner sets exactly what a staff/viewer account may do, and which categories it may move. */
export const PUT = handle<Ctx>(async (req, { params }) => {
  const me = await requireApiUser("users.manage");
  const { id } = await params;
  const input = userPermissionsSchema.parse(await readJson(req));
  const valid = new Set<string>(TOGGLEABLE.map((t) => t.action));
  const perms = input.permissions ? Array.from(new Set(input.permissions.filter((p) => valid.has(p)))) : null;
  const before = await queryOne<{ role: string; permissions: string[] | null; allowed_category_ids: number[] | null }>(
    "SELECT role, permissions, allowed_category_ids FROM users WHERE id = $1", [id]);
  if (!before) throw new AppError("NOT_FOUND", "User not found.", 404);
  if (before.role === "owner") throw new AppError("OWNER_ALL", "Owners always have full access.", 409);
  await queryOne("UPDATE users SET permissions = $2, allowed_category_ids = $3, updated_at = now() WHERE id = $1 RETURNING id",
    [id, perms, input.allowed_category_ids && input.allowed_category_ids.length ? input.allowed_category_ids : null]);
  await audit(me.id, "user.permissions", "user", id, {
    before: { permissions: before.permissions, categories: before.allowed_category_ids },
    after: { permissions: perms, categories: input.allowed_category_ids },
  });
  return ok();
});
