"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Check, CheckCircle2, Mail, Send, X } from "@/components/hand-icons";
import { Button, Field, Input, Panel } from "./ui/primitives";
import { useToast } from "./ui/toast";
import { api } from "@/lib/client";
import type { MailAccount } from "@/lib/settings";

type Provider = "brevo_api" | "gmail" | "brevo" | "other";
type Step = { step: string; ok: boolean; detail: string };

const PRESETS: Record<Exclude<Provider, "other">, { host: string; port: string }> = {
  brevo_api: { host: "api.brevo.com", port: "443" },
  gmail: { host: "smtp.gmail.com", port: "465" },
  brevo: { host: "smtp-relay.brevo.com", port: "587" },
};

/** Store Settings, Email account: the mailbox the app sends from. */
export function MailAccountForm({ initial, active, ownerEmail }: {
  initial: MailAccount; active: { source: "server" | "settings"; from: string } | null; ownerEmail: string;
}) {
  const guess: Provider = !initial.smtp_host ? "brevo_api" : initial.smtp_host === "api.brevo.com" ? "brevo_api" : initial.smtp_host.includes("gmail") ? "gmail" : initial.smtp_host.includes("brevo") ? "brevo" : "other";
  const [provider, setProvider] = useState<Provider>(guess);
  const [a, setA] = useState({
    smtp_host: initial.smtp_host ?? PRESETS.brevo_api.host,
    smtp_port: String(initial.smtp_port ?? 443),
    smtp_user: initial.smtp_user ?? "",
    smtp_pass: "",
    smtp_from: initial.smtp_from ?? "",
    welcome_email_enabled: initial.welcome_email_enabled,
  });
  const [hasPass, setHasPass] = useState(initial.has_password);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testTo, setTestTo] = useState(ownerEmail);
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const toast = useToast();
  const router = useRouter();
  const fromServer = active?.source === "server";

  const pick = (p: Provider) => {
    setProvider(p);
    if (p !== "other") setA((x) => ({ ...x, smtp_host: PRESETS[p].host, smtp_port: PRESETS[p].port }));
  };

  const check = async () => {
    setChecking(true); setErr(null);
    try {
      const d = await api<{ ok: boolean; steps: Step[] }>("/api/settings/email/check", { method: "POST" });
      setSteps(d.steps);
      if (d.ok) toast.success("Email account works", "Now send a test email to be sure it arrives.");
    } catch (e) { setErr((e as Error).message); } finally { setChecking(false); }
  };

  const save = async () => {
    setBusy(true); setErr(null); setSteps(null);
    try {
      const fromDefault = provider === "brevo" || provider === "brevo_api" ? "" : a.smtp_user ? `The Velvet Store <${a.smtp_user.trim()}>` : "";
      const d = await api<{ account: MailAccount }>("/api/settings/email", {
        method: "PUT",
        json: { ...a, smtp_user: provider === "brevo_api" ? "" : a.smtp_user.trim(), smtp_host: a.smtp_host.trim(), smtp_port: Number(a.smtp_port), smtp_from: a.smtp_from.trim() || fromDefault },
      });
      setHasPass(d.account.has_password);
      setA((x) => ({ ...x, smtp_pass: "", smtp_from: d.account.smtp_from ?? "" }));
      router.refresh();
      await check();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  const test = async () => {
    setTesting(true); setErr(null);
    try {
      const d = await api<{ to: string }>("/api/settings/test-email", { method: "POST", json: { to: testTo.trim() } });
      toast.success("Test email sent", `Check the inbox of ${d.to}, and the Spam folder.`);
    } catch (e) { setErr((e as Error).message); } finally { setTesting(false); }
  };

  const brevoNeedsFrom = (provider === "brevo" || provider === "brevo_api") && !a.smtp_from.trim();

  return (
    <Panel title={<span className="flex items-center gap-2"><Mail className="size-5" /> Email account</span>}>
      {active ? (
        <p className="mb-4 flex items-start gap-2 rounded-2xl bg-ok-bg px-3 py-2 text-sm text-ok">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          <span>Emails are sent from <strong>{active.from}</strong>{fromServer ? " (set on the server). Saving an account below will replace it." : "."}</span>
        </p>
      ) : (
        <p className="mb-4 rounded-2xl bg-warn-bg px-3 py-2 text-sm text-warn">Not set up yet. Until it is, the app can&apos;t send receipts, reports, messages or welcome emails.</p>
      )}

      <p className="mb-2 text-sm font-medium">Which email service?</p>
      <div className="mb-4 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Email service">
        {([["brevo_api", "Brevo API key (most reliable)"], ["gmail", "Gmail"], ["brevo", "Brevo SMTP"], ["other", "Other"]] as [Provider, string][]).map(([k, l]) => (
          <button key={k} type="button" role="radio" aria-checked={provider === k} onClick={() => pick(k)}
            className={clsx("rounded-full px-4 py-2 text-sm font-semibold ring-1 transition active:scale-95", provider === k ? "bg-burgundy text-white ring-burgundy" : "bg-white/80 ring-kraft hover:bg-white")}>
            {l}
          </button>
        ))}
      </div>

      <div className="mb-5 rounded-2xl bg-white/70 px-4 py-3 text-sm ring-1 ring-kraft">
        {provider === "brevo_api" && (
          <ol className="list-decimal space-y-1 pl-5 text-muted">
            <li>Create a free account at <strong className="text-ink">brevo.com</strong> (300 emails a day) and finish its account activation.</li>
            <li>In Brevo open <strong className="text-ink">Senders, Domains &amp; Dedicated IPs</strong>, add the email you want to send from, and click the confirmation link Brevo emails you.</li>
            <li>Open <strong className="text-ink">SMTP &amp; API</strong>, then <strong className="text-ink">API Keys</strong>, create a key and paste it below. Put that confirmed email in <strong className="text-ink">Send as</strong>.</li>
          </ol>
        )}
        {provider === "gmail" && (
          <ol className="list-decimal space-y-1 pl-5 text-muted">
            <li>Turn on <strong className="text-ink">2-Step Verification</strong> for the Gmail account (myaccount.google.com, Security).</li>
            <li>Open <strong className="text-ink">myaccount.google.com/apppasswords</strong>, create one named &quot;Velvet Store&quot; and copy the 16 letters.</li>
            <li>Type that Gmail address below and paste the 16 letters as the password. <strong className="text-ink">Your normal Gmail password will be rejected.</strong></li>
          </ol>
        )}
        {provider === "brevo" && (
          <ol className="list-decimal space-y-1 pl-5 text-muted">
            <li>Create a free account at <strong className="text-ink">brevo.com</strong> (300 emails a day) and confirm your email address.</li>
            <li>In Brevo open <strong className="text-ink">SMTP &amp; API</strong>, then <strong className="text-ink">SMTP</strong>. Copy the <strong className="text-ink">Login</strong> and create an <strong className="text-ink">SMTP key</strong>.</li>
            <li>Paste the Login as the email address and the SMTP key as the password. In <strong className="text-ink">Send as</strong>, type the email you signed up to Brevo with.</li>
          </ol>
        )}
        {provider === "other" && <p className="text-muted">Use the SMTP details from your email provider (server name, port 465 or 587, login and password).</p>}
      </div>

      <form autoComplete="off" onSubmit={(e) => { e.preventDefault(); save(); }} className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_8rem]">
        {provider !== "brevo_api" && <>
        <Field label="SMTP server" htmlFor="sm-host" required><Input id="sm-host" name="velvet-smtp-host" autoComplete="off" value={a.smtp_host} onChange={(e) => setA({ ...a, smtp_host: e.target.value })} placeholder="smtp.gmail.com" /></Field>
        <Field label="Port" htmlFor="sm-port" required><Input id="sm-port" name="velvet-smtp-port" autoComplete="off" inputMode="numeric" value={a.smtp_port} onChange={(e) => setA({ ...a, smtp_port: e.target.value.replace(/\D/g, "") })} /></Field>
        <Field label={provider === "brevo" ? "Brevo SMTP login" : "Email address (login)"} htmlFor="sm-user" required>
          <Input id="sm-user" name="velvet-smtp-login" autoComplete="off" data-1p-ignore data-lpignore="true" value={a.smtp_user} onChange={(e) => setA({ ...a, smtp_user: e.target.value })} placeholder={provider === "brevo" ? "8a1b2c001@smtp-brevo.com" : "yourstore@gmail.com"} />
        </Field>
        <div className="hidden sm:block" />
        </>}
        <Field label={provider === "brevo_api" ? "Brevo API key" : provider === "gmail" ? "App password (16 letters)" : provider === "brevo" ? "SMTP key" : "Password"} htmlFor="sm-pass" required hint={hasPass ? "A password is saved. Leave empty to keep it." : undefined}>
          <Input id="sm-pass" name="velvet-smtp-secret" type="password" autoComplete="new-password" data-1p-ignore data-lpignore="true" value={a.smtp_pass} onChange={(e) => setA({ ...a, smtp_pass: e.target.value })} placeholder={hasPass ? "••••••••••••" : ""} />
        </Field>
        <div className="hidden sm:block" />
        <Field label="Send as (name and address)" htmlFor="sm-from" required={provider === "brevo" || provider === "brevo_api"}
          hint={provider === "brevo" || provider === "brevo_api" ? "Must be the email you verified in Brevo, e.g. The Velvet Store <you@gmail.com>" : "Optional. Leave empty to send from the login address."}>
          <Input id="sm-from" name="velvet-smtp-from" autoComplete="off" value={a.smtp_from} onChange={(e) => setA({ ...a, smtp_from: e.target.value })} placeholder="The Velvet Store <yourstore@gmail.com>" />
        </Field>
        <button type="submit" className="hidden" />
      </form>

      <label className="mt-5 flex items-start gap-3">
        <input type="checkbox" className="mt-0.5 size-5 accent-burgundy" checked={a.welcome_email_enabled} onChange={(e) => setA({ ...a, welcome_email_enabled: e.target.checked })} />
        <span>
          <span className="block text-sm font-medium">Send a welcome email to new users</span>
          <span className="block text-xs text-muted">When you add someone under Users, they get an email with the sign-in link and their login email.</span>
        </span>
      </label>

      {steps && (
        <ul className="mt-5 space-y-2 rounded-2xl bg-white/70 p-3 ring-1 ring-kraft" data-testid="mail-check">
          {steps.map((s) => (
            <li key={s.step} className="flex items-start gap-2.5 text-sm">
              <span className={clsx("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-white", s.ok ? "bg-ok" : "bg-bad")}>
                {s.ok ? <Check className="size-3.5" strokeWidth={3} /> : <X className="size-3.5" strokeWidth={3} />}
              </span>
              <span><span className="font-semibold">{s.step}</span><span className={clsx("block text-xs", s.ok ? "text-muted" : "text-bad")}>{s.detail}</span></span>
            </li>
          ))}
        </ul>
      )}
      {err && <p role="alert" className="mt-4 rounded-2xl bg-bad-bg px-4 py-3 text-sm text-bad">{err}</p>}

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-1 items-end gap-2">
          <Field label="Send a test to" htmlFor="sm-test" required><Input id="sm-test" type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} /></Field>
          <Button type="button" variant="secondary" onClick={test} loading={testing} disabled={!active || !testTo}><Send className="size-4" /> Test</Button>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={check} loading={checking} disabled={!active}>Check connection</Button>
          <Button type="button" onClick={save} loading={busy} disabled={brevoNeedsFrom}>Save and check</Button>
        </div>
      </div>
    </Panel>
  );
}
