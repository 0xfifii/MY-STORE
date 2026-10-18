import { handle, ok, readJson } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { query } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { getSettings, isValidTimeZone } from "@/lib/settings";
import { settingsSchema } from "@/lib/validation";

export const GET = handle(async () => {
  await requireApiUser("view");
  return ok({ settings: await getSettings() });
});

export const PATCH = handle(async (req) => {
  const user = await requireApiUser("settings.write");
  const s = settingsSchema.parse(await readJson(req));
  if (!isValidTimeZone(s.timezone)) throw new AppError("INVALID_TZ", "Unknown time zone.");
  const before = await getSettings();
  await query(
    `UPDATE settings SET store_name=$1, currency_code=$2, currency_symbol=$3, timezone=$4, auto_report_enabled=$5,
            auto_report_time=$6, auto_report_covers=$7, auto_report_formats=$8, email_enabled=$9, email_recipients=$10,
            auto_weekly_enabled=$11, auto_monthly_enabled=$12, updated_at=now() WHERE id = 1`,
    [s.store_name, s.currency_code, s.currency_symbol, s.timezone, s.auto_report_enabled, s.auto_report_time,
     s.auto_report_covers, s.auto_report_formats, s.email_enabled, s.email_recipients,
     s.auto_weekly_enabled, s.auto_monthly_enabled],
  );
  await audit(user.id, "settings.update", "settings", 1, { before, after: s });
  return ok();
});
