import { PageHeader } from "@/components/ui/primitives";
import { SettingsForm } from "@/components/settings-form";
import { requirePageUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { smtpConfigured } from "@/lib/mailer";

export const metadata = { title: "Store Settings" };

export default async function SettingsPage() {
  await requirePageUser("settings.write");
  const s = await getSettings();
  const zones = Intl.supportedValuesOf("timeZone");
  if (!zones.includes(s.timezone)) zones.unshift(s.timezone);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Store Settings" description="Store name, currency, time zone and the automatic daily, weekly and monthly reports." />
      <SettingsForm
        initial={{
          store_name: s.store_name, currency_code: s.currency_code, currency_symbol: s.currency_symbol, timezone: s.timezone,
          auto_report_enabled: s.auto_report_enabled, auto_report_time: s.auto_report_time, auto_report_covers: s.auto_report_covers,
          auto_report_formats: s.auto_report_formats, email_enabled: s.email_enabled, email_recipients: s.email_recipients,
          auto_weekly_enabled: s.auto_weekly_enabled, auto_monthly_enabled: s.auto_monthly_enabled,
        }}
        timezones={zones}
        smtpReady={smtpConfigured()}
        cronReady={process.env.DISABLE_INTERNAL_SCHEDULER !== "true" || Boolean(process.env.CRON_SECRET && process.env.CRON_SECRET.length >= 16)}
      />
    </div>
  );
}
