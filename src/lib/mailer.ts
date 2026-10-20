import "server-only";
import nodemailer from "nodemailer";
import { query, queryOne } from "./db";

export type MailConfig = {
  host: string;
  port: number;
  user: string | null;
  pass: string | null;
  from: string;
  secure: boolean;
  /** "server" = SMTP_* environment variables, "settings" = saved in Store Settings. */
  source: "server" | "settings";
};

export type MailKind = "message" | "receipt" | "report" | "audit_report" | "welcome" | "test" | "scheduled";

/** Enough to send an email again later: the text and how to rebuild its attachment. */
export type MailPayload = {
  text: string;
  html?: string;
  replyTo?: string;
  attach?:
    | { kind: "receipt"; txnId: string }
    | { kind: "report"; preset: string; format: "pdf" | "xlsx" | "csv" }
    | { kind: "audit"; month: string; format: "pdf" | "xlsx" }
    | { kind: "welcome"; userId: string };
};

/**
 * The mail account to send from. Server variables (SMTP_HOST …) win; otherwise the account saved in
 * Store Settings. Returns null when neither is set.
 */
export async function mailConfig(): Promise<MailConfig | null> {
  if (process.env.SMTP_HOST && process.env.SMTP_FROM) {
    const port = Number(process.env.SMTP_PORT ?? 587);
    return {
      host: process.env.SMTP_HOST,
      port,
      user: process.env.SMTP_USER || null,
      pass: process.env.SMTP_PASS || null,
      from: process.env.SMTP_FROM,
      secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465,
      source: "server",
    };
  }
  const s = await queryOne<{ smtp_host: string | null; smtp_port: number | null; smtp_user: string | null; smtp_pass: string | null; smtp_from: string | null }>(
    "SELECT smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from FROM settings WHERE id = 1",
  );
  if (!s?.smtp_host || !(s.smtp_from || s.smtp_user)) return null;
  const port = s.smtp_port ?? 465;
  return {
    host: s.smtp_host,
    port,
    user: s.smtp_user,
    pass: s.smtp_pass,
    from: s.smtp_from || s.smtp_user!,
    secure: port === 465,
    source: "settings",
  };
}

export async function smtpConfigured() {
  return (await mailConfig()) !== null;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Branded HTML version of a plain-text email (paragraphs, simple "Label: value" lines kept). */
export function emailHtml(storeName: string, title: string, text: string, button?: { label: string; href: string }) {
  const paras = text
    .trim()
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;line-height:1.55">${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const btn = button
    ? `<p style="margin:22px 0 6px"><a href="${esc(button.href)}" style="display:inline-block;background:#2b1613;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:600">${esc(button.label)}</a></p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#f3e8dc;font-family:'DM Sans',Arial,Helvetica,sans-serif;color:#2b1613">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3e8dc;padding:28px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:22px;overflow:hidden">
<tr><td style="background:#8f0e16;padding:20px 26px;color:#fff;font-size:20px;font-weight:700;letter-spacing:-0.2px">${esc(storeName)}</td></tr>
<tr><td style="padding:26px 26px 8px"><h1 style="margin:0 0 16px;font-size:20px;font-weight:600">${esc(title)}</h1>${paras}${btn}</td></tr>
<tr><td style="padding:14px 26px 22px;color:#85706a;font-size:12px">Sent by the ${esc(storeName)} inventory app.</td></tr>
</table></td></tr></table></body></html>`;
}

/** Sends an email and records it in the email log (sent or failed). Throws if it couldn't be sent. */
export async function sendMail(opts: {
  to: string[];
  subject: string;
  text: string;
  html?: string;
  attachments?: { filename: string; content: Buffer; contentType?: string }[];
  kind?: MailKind;
  userId?: string | null;
  replyTo?: string;
  /** How to resend; defaults to the text/html with no attachment. */
  payload?: Omit<MailPayload, "text" | "html" | "replyTo">;
  resendOf?: string | null;
}) {
  const cfg = await mailConfig();
  const payload: MailPayload = { text: opts.text, html: opts.html, replyTo: opts.replyTo, ...opts.payload };
  const log = async (status: "sent" | "failed", error?: string) => {
    await query(
      `INSERT INTO email_log (sent_by, kind, recipients, subject, attachments, status, error, payload, resend_of)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [opts.userId ?? null, opts.kind ?? "message", opts.to, opts.subject, (opts.attachments ?? []).map((a) => a.filename), status, error ?? null,
       JSON.stringify(payload), opts.resendOf ?? null],
    ).catch((e) => console.error("[mail] could not log email", e));
  };
  if (!cfg) {
    const msg = "Email isn't set up yet. An owner needs to add the email account in Store Settings, Email account.";
    await log("failed", msg);
    throw new Error(msg);
  }
  let transport: ReturnType<typeof makeTransport>;
  try {
    transport = await connect(cfg);
  } catch (e) {
    const msg = friendlySmtpError(e as Error);
    await log("failed", msg);
    throw new Error(msg);
  }
  try {
    const info = await transport.sendMail({
      from: cfg.from,
      to: opts.to.join(", "),
      replyTo: opts.replyTo,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
      attachments: opts.attachments,
    });
    await log("sent");
    return info.messageId as string;
  } catch (e) {
    const msg = friendlySmtpError(e as Error);
    await log("failed", msg);
    throw new Error(msg);
  }
}

function makeTransport(cfg: MailConfig, port: number) {
  return nodemailer.createTransport({
    host: cfg.host,
    port,
    secure: port === 465,
    requireTLS: port === 587,
    auth: cfg.user ? { user: cfg.user, pass: cfg.pass ?? "" } : undefined,
    tls: { servername: cfg.host, ...(process.env.SMTP_ALLOW_SELF_SIGNED === "true" ? { rejectUnauthorized: false } : {}) },
    connectionTimeout: 12000,
    greetingTimeout: 12000,
    socketTimeout: 30000,
  });
}

const isConnectionProblem = (e: Error & { code?: string }) =>
  /ETIMEDOUT|ECONNREFUSED|ECONNRESET|ESOCKET|EHOSTUNREACH|Greeting never received|timeout|wrong version number/i.test(`${e.code ?? ""} ${e.message}`);

/**
 * Opens and verifies an SMTP connection. If the chosen port can't be reached, the other standard port
 * is tried (465 SSL <-> 587 STARTTLS) and, for an account saved in Store Settings, remembered.
 */
async function connect(cfg: MailConfig) {
  const ports = [cfg.port, ...[465, 587].filter((p) => p !== cfg.port)];
  let first: Error | null = null;
  for (const port of ports) {
    const t = makeTransport(cfg, port);
    try {
      await t.verify();
      if (port !== cfg.port && cfg.source === "settings") {
        await query("UPDATE settings SET smtp_port = $1 WHERE id = 1", [port]).catch(() => {});
      }
      return t;
    } catch (e) {
      first ??= e as Error;
      if (!isConnectionProblem(e as Error)) throw e; // a login problem won't be fixed by another port
    }
  }
  throw first ?? new Error("Couldn't reach the mail server.");
}

/** Step-by-step check for Store Settings: reach the server, log in. */
export async function diagnoseMail(): Promise<{ ok: boolean; steps: { step: string; ok: boolean; detail: string }[] }> {
  const cfg = await mailConfig();
  const steps: { step: string; ok: boolean; detail: string }[] = [];
  if (!cfg) return { ok: false, steps: [{ step: "Email account saved", ok: false, detail: "Fill in the server, email address and app password, then save." }] };
  steps.push({ step: "Email account saved", ok: true, detail: `${cfg.user ?? "(no login)"} on ${cfg.host}:${cfg.port}${cfg.source === "server" ? " (server settings)" : ""}` });
  if (!cfg.user || !cfg.pass) steps.push({ step: "Login details", ok: false, detail: "The email address or the app password is missing." });
  try {
    const t = await connect(cfg);
    steps.push({ step: "Reached the mail server and logged in", ok: true, detail: "The mail server accepted the email address and password." });
    t.close();
    return { ok: steps.every((s) => s.ok), steps };
  } catch (e) {
    steps.push({ step: isConnectionProblem(e as Error) ? "Reach the mail server" : "Log in to the mail server", ok: false, detail: friendlySmtpError(e as Error) });
    return { ok: false, steps };
  }
}

function friendlySmtpError(e: Error & { code?: string; responseCode?: number; response?: string }) {
  const raw = `${e.response ?? e.message}`.replace(/\s+/g, " ").trim();
  const code = e.responseCode ? ` (code ${e.responseCode})` : e.code ? ` (${e.code})` : "";
  const tail = ` Mail server said: "${raw.slice(0, 180)}"${code}`;
  if (/5\.7\.9|Application-specific password required/i.test(raw)) {
    return "Gmail needs an App Password here, not your normal Gmail password. Turn on 2-Step Verification, create an App Password at myaccount.google.com/apppasswords, paste the 16 letters and save." + tail;
  }
  if (/535|5\.7\.8|Username and Password not accepted|Invalid login|BadCredentials|authentication failed|AUTH.*failed|EAUTH/i.test(`${raw} ${e.code}`)) {
    return "The mail server rejected the login. Check the email address is the same account the App Password (or SMTP key) was made for, and paste the password again." + tail;
  }
  if (/530|Authentication Required|5\.7\.0/i.test(raw)) return "The mail server wants a login. Fill in the email address and app password." + tail;
  if (/553|5\.7\.1|Sender address rejected|not owned|sender.*not.*(valid|verified|allowed)/i.test(raw)) {
    return "The mail server refused the sender address. Make \"Send as\" use the same email address you log in with (or a sender you verified with your email provider)." + tail;
  }
  if (/ENOTFOUND|EAI_AGAIN/i.test(`${e.code} ${raw}`)) return "The mail server name couldn't be found. For Gmail use smtp.gmail.com; for Brevo use smtp-relay.brevo.com." + tail;
  if (/self[- ]signed|certificate|CERT_/i.test(raw)) return "The mail server's security certificate was not accepted. Check the server name is exactly right." + tail;
  if (isConnectionProblem(e)) return "Couldn't reach the mail server on port 465 or 587. Check the server name." + tail;
  if (/Invalid recipient|550|No recipients|mailbox unavailable/i.test(raw)) return "The mail server refused one of the addresses you're sending to. Check it is typed correctly." + tail;
  if (/daily.*limit|quota|rate limit|421|454/i.test(raw)) return "The mail account has hit its sending limit for now. Try again later." + tail;
  return "The mail server rejected the message." + tail;
}
