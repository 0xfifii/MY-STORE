import { z } from "zod";
import { handle, ok, readJson } from "@/lib/api";
import { hashPassword, requireApiUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { query, queryOne } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { appUrl, sendWelcomeEmail } from "@/lib/notify";
import type { Role } from "@/lib/permissions";
import { passwordSchema } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

/**
 * (Re)send the welcome email to a user. Optionally set a new temporary password first and include it
 * (passwords are stored hashed, so the old one can't be sent again).
 */
export const POST = handle<Ctx>(async (req, { params }) => {
  const me = await requireApiUser("users.manage");
  const { id } = await params;
  const b = z.object({ new_password: passwordSchema.optional() }).parse(await readJson(req));
  const u = /^[0-9a-f-]{36}$/i.test(id) ? await queryOne<{ id: string; name: string; email: string; role: Role }>("SELECT id, name, email, role FROM users WHERE id = $1 AND store_id = current_store()", [id]) : null;
  if (!u) throw new AppError("NOT_FOUND", "User not found.", 404);
  if (b.new_password) {
    await query("UPDATE users SET password_hash = $2 WHERE id = $1", [id, await hashPassword(b.new_password)]);
    await query("DELETE FROM sessions WHERE user_id = $1", [id]);
    await audit(me.id, "user.update", "user", id, { changes: { password: { from: "(hidden)", to: "(reset and emailed)" } } });
  }
  const r = await sendWelcomeEmail({ ...u, password: b.new_password ?? null }, { by: me, url: appUrl(req), force: true });
  if (r.status !== "sent") throw new AppError(r.status === "not_configured" ? "SMTP_MISSING" : "EMAIL_FAILED", r.detail ?? "The email could not be sent.", r.status === "not_configured" ? 409 : 502);
  return ok({ sent: u.email });
});

/** Sending email can take a while (mail server handshake, attachments). */
export const maxDuration = 60;
