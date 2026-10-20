"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Mail, Send } from "lucide-react";
import { Button, Field, Input, Panel } from "./ui/primitives";
import { useToast } from "./ui/toast";
import { api } from "@/lib/client";
import type { MailAccount } from "@/lib/settings";

/** Store Settings → Email account: the mailbox the app sends from (Gmail works with an App Password). */
export function MailAccountForm({ initial, active, ownerEmail }: {
  initial: MailAccount; active: { source: "server" | "settings"; from: string } | null; ownerEmail: string;
}) {
  const [a, setA] = useState({
    smtp_host: initial.smtp_host ?? "smtp.gmail.com",
    smtp_port: String(initial.smtp_port ?? 465),
    smtp_user: initial.smtp_user ?? "",
    smtp_pass: "",
    smtp_from: initial.smtp_from ?? "",
    welcome_email_enabled: initial.welcome_email_enabled,
  });
  const [hasPass, setHasPass] = useState(initial.has_password);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testTo, setTestTo] = useState(ownerEmail);
  const [err, setErr] = useState<string | null>(null);
  const toast = useToast();
  const router = useRouter();
  const fromServer = active?.source === "server";

  const save = async () => {
    setBusy(true); setErr(null);
    try {
      const d = await api<{ account: MailAccount }>("/api/settings/email", {
        method: "PUT",
        json: { ...a, smtp_port: Number(a.smtp_port), smtp_from: a.smtp_from || (a.smtp_user ? `My Store <${a.smtp_user}>` : "") },
      });
      setHasPass(d.account.has_password);
      setA({ ...a, smtp_pass: "", smtp_from: d.account.smtp_from ?? "" });
      toast.success("Email account saved", "Send a test email to check it works.");
      router.refresh();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const test = async () => {
    setTesting(true); setErr(null);
    try {
      const d = await api<{ to: string }>("/api/settings/test-email", { method: "POST", json: { to: testTo } });
      toast.success("Test email sent", `Check the inbox of ${d.to} (and the spam folder).`);
    } catch (e) { setErr((e as Error).message); } finally { setTesting(false); }
  };

  return (
    <Panel title={<span className="flex items-center gap-2"><Mail className="size-4" /> Email account</span>}>
      {active ? (
        <p className="mb-4 flex items-start gap-2 rounded-2xl bg-ok-bg px-3 py-2 text-sm text-ok">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          <span>Emails are sent from <strong>{active.from}</strong>{fromServer ? " (set on the server, which overrides the form below)." : "."}</span>
        </p>
      ) : (
        <p className="mb-4 rounded-2xl bg-warn-bg px-3 py-2 text-sm text-warn">Not set up yet. Until it is, the app can&apos;t send receipts, reports, messages or welcome emails.</p>
      )}

      <details className="mb-4 rounded-2xl bg-white/70 px-4 py-3 text-sm ring-1 ring-white">
        <summary className="cursor-pointer font-semibold">How to use a Gmail account</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted">
          <li>Turn on 2-Step Verification for the Google account (myaccount.google.com → Security).</li>
          <li>Open <strong className="text-ink">myaccount.google.com/apppasswords</strong>, create an app password named &quot;My Store&quot; and copy the 16 letters.</li>
          <li>Below: server <strong className="text-ink">smtp.gmail.com</strong>, port <strong className="text-ink">465</strong>, your Gmail address, and the 16-letter app password.</li>
          <li>Save, then send a test email.</li>
        </ol>
      </details>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_8rem]">
        <Field label="SMTP server" htmlFor="sm-host"><Input id="sm-host" value={a.smtp_host} onChange={(e) => setA({ ...a, smtp_host: e.target.value })} placeholder="smtp.gmail.com" /></Field>
        <Field label="Port" htmlFor="sm-port"><Input id="sm-port" inputMode="numeric" value={a.smtp_port} onChange={(e) => setA({ ...a, smtp_port: e.target.value.replace(/\D/g, "") })} /></Field>
        <Field label="Email address (login)" htmlFor="sm-user"><Input id="sm-user" type="email" value={a.smtp_user} onChange={(e) => setA({ ...a, smtp_user: e.target.value })} placeholder="yourstore@gmail.com" /></Field>
        <div className="hidden sm:block" />
        <Field label="Password / app password" htmlFor="sm-pass" hint={hasPass ? "A password is saved. Leave empty to keep it." : "For Gmail, the 16-letter app password."}>
          <Input id="sm-pass" type="password" autoComplete="new-password" value={a.smtp_pass} onChange={(e) => setA({ ...a, smtp_pass: e.target.value })} placeholder={hasPass ? "••••••••••••" : ""} />
        </Field>
        <div className="hidden sm:block" />
        <Field label="Send as (name and address)" htmlFor="sm-from" hint="Optional. e.g. My Store <yourstore@gmail.com>">
          <Input id="sm-from" value={a.smtp_from} onChange={(e) => setA({ ...a, smtp_from: e.target.value })} placeholder={a.smtp_user ? `My Store <${a.smtp_user}>` : "My Store <yourstore@gmail.com>"} />
        </Field>
      </div>

      <label className="mt-5 flex items-start gap-3">
        <input type="checkbox" className="mt-0.5 size-5 accent-burgundy" checked={a.welcome_email_enabled} onChange={(e) => setA({ ...a, welcome_email_enabled: e.target.checked })} />
        <span>
          <span className="block text-sm font-medium">Send a welcome email to new users</span>
          <span className="block text-xs text-muted">When you add someone under Users, they get an email with the sign-in link and their login email.</span>
        </span>
      </label>

      {err && <p role="alert" className="mt-4 rounded-2xl bg-bad-bg px-4 py-3 text-sm text-bad">{err}</p>}
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-1 items-end gap-2">
          <Field label="Send a test to" htmlFor="sm-test"><Input id="sm-test" type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} /></Field>
          <Button type="button" variant="secondary" onClick={test} loading={testing} disabled={!active || !testTo}><Send className="size-4" /> Test</Button>
        </div>
        <Button type="button" onClick={save} loading={busy}>Save email account</Button>
      </div>
    </Panel>
  );
}
