import { z } from "zod";
import { handle, ok, readJson } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { query } from "@/lib/db";
import { mailConfig } from "@/lib/mailer";
import { getMailAccount } from "@/lib/settings";

const schema = z.object({
  smtp_host: z.string().trim().max(200).regex(/^[a-zA-Z0-9.-]*$/, "Server name can only contain letters, numbers, dots and dashes"),
  smtp_port: z.coerce.number().int().min(1).max(65535),
  smtp_user: z.string().trim().max(200),
  /** Omit or leave empty to keep the saved password. */
  smtp_pass: z.string().max(300).optional(),
  smtp_from: z.string().trim().max(200),
  welcome_email_enabled: z.boolean(),
});

export const GET = handle(async () => {
  await requireApiUser("settings.write");
  const cfg = await mailConfig();
  return ok({ account: await getMailAccount(), active: cfg ? { source: cfg.source, from: cfg.from } : null });
});

export const PUT = handle(async (req) => {
  const user = await requireApiUser("settings.write");
  const b = schema.parse(await readJson(req));
  await query(
    `UPDATE settings SET smtp_host = nullif($1,''), smtp_port = $2, smtp_user = nullif($3,''),
            smtp_pass = CASE WHEN $4::text IS NULL OR $4 = '' THEN smtp_pass ELSE $4 END,
            smtp_from = nullif($5,''), welcome_email_enabled = $6, updated_at = now() WHERE id = 1`,
    [b.smtp_host, b.smtp_port, b.smtp_user, b.smtp_pass ? b.smtp_pass.replace(/\s+/g, "") : null, b.smtp_from, b.welcome_email_enabled],
  );
  await audit(user.id, "settings.email", "settings", 1, {
    smtp_host: b.smtp_host, smtp_port: b.smtp_port, smtp_user: b.smtp_user, smtp_from: b.smtp_from,
    password_changed: Boolean(b.smtp_pass), welcome_email_enabled: b.welcome_email_enabled,
  });
  return ok({ account: await getMailAccount() });
});

export const DELETE = handle(async () => {
  const user = await requireApiUser("settings.write");
  await query("UPDATE settings SET smtp_host=NULL, smtp_port=NULL, smtp_user=NULL, smtp_pass=NULL, smtp_from=NULL WHERE id = 1");
  await audit(user.id, "settings.email", "settings", 1, { removed: true });
  return ok();
});
