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
  updated_at: string;
};

export async function getSettings(): Promise<StoreSettings> {
  const s = await queryOne<StoreSettings>("SELECT * FROM settings WHERE id = 1");
  if (!s) throw new Error("Settings row missing — run database migrations.");
  return s;
}

export function isValidTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
