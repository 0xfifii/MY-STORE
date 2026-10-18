"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mail } from "lucide-react";
import { Button, Field, Input, Panel, Select } from "./ui/primitives";
import { useToast } from "./ui/toast";
import { api } from "@/lib/client";

type S = {
  store_name: string; currency_code: string; currency_symbol: string; timezone: string;
  auto_report_enabled: boolean; auto_report_time: string; auto_report_covers: "previous_day" | "same_day";
  auto_report_formats: ("pdf" | "xlsx" | "csv")[]; email_enabled: boolean; email_recipients: string[];
  auto_weekly_enabled: boolean; auto_monthly_enabled: boolean;
};

const CURRENCIES = [
  { code: "NGN", symbol: "₦", label: "Nigerian naira (₦)" },
  { code: "GHS", symbol: "GH₵", label: "Ghanaian cedi (GH₵)" },
  { code: "KES", symbol: "KSh", label: "Kenyan shilling (KSh)" },
  { code: "ZAR", symbol: "R", label: "South African rand (R)" },
  { code: "XOF", symbol: "CFA", label: "West African CFA (CFA)" },
  { code: "USD", symbol: "$", label: "US dollar ($)" },
  { code: "GBP", symbol: "£", label: "British pound (£)" },
  { code: "EUR", symbol: "€", label: "Euro (€)" },
];

export function SettingsForm({ initial, timezones, smtpReady, cronReady }: { initial: S; timezones: string[]; smtpReady: boolean; cronReady: boolean }) {
  const [s, setS] = useState({ ...initial, auto_report_time: initial.auto_report_time.slice(0, 5), recipients: initial.email_recipients.join(", ") });
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const toast = useToast();
  const router = useRouter();
  const known = CURRENCIES.find((c) => c.code === s.currency_code);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const { recipients, ...rest } = s;
      await api("/api/settings", {
        method: "PATCH",
        json: { ...rest, email_recipients: recipients.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean) },
      });
      toast.success("Settings saved");
      router.refresh();
    } catch (e2) { setErr((e2 as Error).message); } finally { setBusy(false); }
  };
  const testEmail = async () => {
    setTesting(true);
    try { await api("/api/settings/test-email", { method: "POST" }); toast.success("Test email sent", "Check the recipients' inboxes."); }
    catch (e) { toast.error("Test email not sent", (e as Error).message); } finally { setTesting(false); }
  };
  const toggleFormat = (f: "pdf" | "xlsx" | "csv") =>
    setS({ ...s, auto_report_formats: s.auto_report_formats.includes(f) ? s.auto_report_formats.filter((x) => x !== f) : [...s.auto_report_formats, f] });

  return (
    <form onSubmit={save} className="space-y-6" noValidate>
      <Panel title="Store">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Store name" htmlFor="sn" required><Input id="sn" value={s.store_name} onChange={(e) => setS({ ...s, store_name: e.target.value })} /></Field>
          <Field label="Time zone" htmlFor="tz" required hint="Decides where each day starts and ends in reports.">
            <Select id="tz" value={s.timezone} onChange={(e) => setS({ ...s, timezone: e.target.value })}>
              {timezones.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </Field>
          <Field label="Currency" htmlFor="cur" required>
            <Select id="cur" value={known ? s.currency_code : "custom"} onChange={(e) => {
              const c = CURRENCIES.find((x) => x.code === e.target.value);
              setS(c ? { ...s, currency_code: c.code, currency_symbol: c.symbol } : { ...s, currency_code: "", currency_symbol: "" });
            }}>
              {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
              <option value="custom">Other…</option>
            </Select>
          </Field>
          {!known && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Code" htmlFor="cc" required><Input id="cc" maxLength={3} value={s.currency_code} onChange={(e) => setS({ ...s, currency_code: e.target.value.toUpperCase() })} /></Field>
              <Field label="Symbol" htmlFor="cs" required><Input id="cs" maxLength={5} value={s.currency_symbol} onChange={(e) => setS({ ...s, currency_symbol: e.target.value })} /></Field>
            </div>
          )}
          <Field label="Costing method" htmlFor="cm" required hint="Each Stock Out is valued at the average cost of the stock on hand at that moment, and that cost is saved with the transaction.">
            <Select id="cm" value="weighted_average" disabled><option value="weighted_average">Weighted-average cost (perpetual)</option></Select>
          </Field>
        </div>
      </Panel>

      <Panel title="Automatic reports">
        <label className="flex items-start gap-3">
          <input type="checkbox" className="mt-0.5 size-5 accent-burgundy" checked={s.auto_report_enabled} onChange={(e) => setS({ ...s, auto_report_enabled: e.target.checked })} />
          <span>
            <span className="block text-sm font-medium">Daily report</span>
            <span className="block text-xs text-muted">Saved to Report History every day. Runs on the server — no one needs to have the app open.</span>
          </span>
        </label>
        <label className="mt-3 flex items-start gap-3">
          <input type="checkbox" className="mt-0.5 size-5 accent-burgundy" checked={s.auto_weekly_enabled} onChange={(e) => setS({ ...s, auto_weekly_enabled: e.target.checked })} />
          <span>
            <span className="block text-sm font-medium">Weekly report</span>
            <span className="block text-xs text-muted">Every Monday, for the previous week (Monday to Sunday).</span>
          </span>
        </label>
        <label className="mt-3 flex items-start gap-3">
          <input type="checkbox" className="mt-0.5 size-5 accent-burgundy" checked={s.auto_monthly_enabled} onChange={(e) => setS({ ...s, auto_monthly_enabled: e.target.checked })} />
          <span>
            <span className="block text-sm font-medium">Monthly report</span>
            <span className="block text-xs text-muted">On the 1st of each month, for the previous month.</span>
          </span>
        </label>
        {!cronReady && (
          <p className="mt-3 rounded-md bg-warn-bg px-3 py-2 text-sm text-warn">
            The server&apos;s scheduler isn&apos;t set up yet (CRON_SECRET is missing). See “Automatic daily reports” in the README.
          </p>
        )}
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Time" htmlFor="rt" required hint={`In ${s.timezone}`}>
            <Input id="rt" type="time" value={s.auto_report_time} onChange={(e) => setS({ ...s, auto_report_time: e.target.value })} />
          </Field>
          <Field label="The daily report covers" htmlFor="rc" required>
            <Select id="rc" value={s.auto_report_covers} onChange={(e) => setS({ ...s, auto_report_covers: e.target.value as S["auto_report_covers"] })}>
              <option value="previous_day">The previous full day (recommended for morning times)</option>
              <option value="same_day">The same day, up to the report time</option>
            </Select>
          </Field>
          <fieldset className="sm:col-span-2">
            <legend className="text-sm font-medium">Formats</legend>
            <div className="mt-2 flex gap-4">
              {(["pdf", "xlsx", "csv"] as const).map((f) => (
                <label key={f} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="size-4 accent-burgundy" checked={s.auto_report_formats.includes(f)} onChange={() => toggleFormat(f)} />
                  {f === "pdf" ? "PDF" : f === "xlsx" ? "Excel (.xlsx)" : "CSV"}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      </Panel>

      <Panel title="Email delivery">
        {!smtpReady && (
          <p className="mb-4 rounded-md bg-canvas px-3 py-2 text-sm text-muted ring-1 ring-line">
            The server has no mail account configured, so reports are only saved to Report History. To email them, add the SMTP settings described in the README.
          </p>
        )}
        <label className="flex items-start gap-3">
          <input type="checkbox" className="mt-0.5 size-5 accent-burgundy" checked={s.email_enabled} onChange={(e) => setS({ ...s, email_enabled: e.target.checked })} />
          <span>
            <span className="block text-sm font-medium">Email the automatic reports</span>
            <span className="block text-xs text-muted">The files are attached to one email each time reports are generated.</span>
          </span>
        </label>
        <div className="mt-4">
          <Field label="Recipients" htmlFor="rcp" required={s.email_enabled} hint="Separate addresses with commas.">
            <Input id="rcp" value={s.recipients} onChange={(e) => setS({ ...s, recipients: e.target.value })} placeholder="owner@example.com, manager@example.com" />
          </Field>
        </div>
        <Button type="button" variant="secondary" size="sm" className="mt-3" onClick={testEmail} loading={testing} disabled={!smtpReady}>
          <Mail className="size-4" /> Send test email
        </Button>
      </Panel>

      {err && <p role="alert" className="rounded-md bg-bad-bg px-4 py-3 text-sm text-bad">{err}</p>}
      <div className="flex justify-end"><Button type="submit" size="lg" loading={busy}>Save settings</Button></div>
    </form>
  );
}
