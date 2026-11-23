import { z } from "zod";
import { handle, ok, readJson } from "@/lib/api";
import { hashPassword, requireApiUser, verifyPassword } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { query, queryOne } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { passwordSchema } from "@/lib/validation";

const schema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(120),
  company_name: z.string().trim().min(2, "Enter the company name").max(120).optional(),
  current_password: z.string().optional(),
  new_password: passwordSchema.optional().or(z.literal("")),
});

/** Edit your own profile: your name, your password and (for owners) the company name. */
export const PATCH = handle(async (req) => {
  const user = await requireApiUser("view", { allowLocked: true });
  const b = schema.parse(await readJson(req));

  await query("UPDATE users SET name = $1, updated_at = now() WHERE id = $2", [b.name, user.id]);

  if (b.company_name !== undefined && b.company_name !== user.store_name) {
    if (!can(user, "settings.write")) throw new AppError("FORBIDDEN", "Only the owner can change the company name.", 403);
    await query("UPDATE settings SET store_name = $1, updated_at = now() WHERE store_id = current_store()", [b.company_name]);
    await query("UPDATE stores SET name = $1 WHERE id = current_store()", [b.company_name]);
  }

  if (b.new_password) {
    const row = await queryOne<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = $1", [user.id]);
    if (!row || !b.current_password || !(await verifyPassword(b.current_password, row.password_hash))) {
      throw new AppError("WRONG_PASSWORD", "Your current password isn't right.", 400);
    }
    await query("UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2", [await hashPassword(b.new_password), user.id]);
  }

  await audit(user.id, "profile.update", "user", user.id, { name: b.name, company_name: b.company_name, password_changed: Boolean(b.new_password) });
  return ok();
});
