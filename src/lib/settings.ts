import "server-only";
import { queryOne } from "./db";

export type StoreSettings = {
  store_name: string;
  currency_code: string;
  currency_symbol: string;
  timezone: string;
  costing_method: "weighted_average";
  auto_report_enabled: boolean;
  auto_report_time: string; // HH:MM:SS
  auto_report_covers: "previous_day" | "same_day";
  auto_weekly_enabled: boolean;
  auto_monthly_enabled: boolean;
  auto_report_formats: ("pdf" | "xlsx" | "csv")[];
  email_enabled: boolean;
  email_recipients: string[];
  welcome_email_enabled: boolean;
  updated_at: string;
};

export async function getSettings(): Promise<StoreSettings> {
  const s = await queryOne<StoreSettings & Record<string, unknown>>("SELECT * FROM settings WHERE id = 1");
  if (!s) throw new Error("Settings row missing — run database migrations.");
  // The mail account (and its password) never leaves the server through general settings.
  for (const k of ["smtp_host", "smtp_port", "smtp_user", "smtp_pass", "smtp_from"]) delete s[k];
  return s;
}

export type MailAccount = {
  smtp_host: string | null; smtp_port: number | null; smtp_user: string | null; smtp_from: string | null;
  has_password: boolean; welcome_email_enabled: boolean;
};

/** Mail account as shown in Store Settings — the password itself is never returned. */
export async function getMailAccount(): Promise<MailAccount> {
  const r = await queryOne<MailAccount>(
    `SELECT smtp_host, smtp_port, smtp_user, smtp_from, (coalesce(smtp_pass,'') <> '') AS has_password, welcome_email_enabled
       FROM settings WHERE id = 1`,
  );
  return r!;
}

export function isValidTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
