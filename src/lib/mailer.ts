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
    ? `<p style="margin:22px 0 6px"><a href="${esc(button.href)}" style="display:inline-block;background:#1d1517;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:600">${esc(button.label)}</a></p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#f4eeef;font-family:'DM Sans',Arial,Helvetica,sans-serif;color:#1d1517">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4eeef;padding:28px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:22px;overflow:hidden">
<tr><td style="background:#7a1f35;padding:20px 26px;color:#fff;font-size:20px;font-weight:700;letter-spacing:-0.2px">${esc(storeName)}</td></tr>
<tr><td style="padding:26px 26px 8px"><h1 style="margin:0 0 16px;font-size:20px;font-weight:600">${esc(title)}</h1>${paras}${btn}</td></tr>
<tr><td style="padding:14px 26px 22px;color:#77696d;font-size:12px">Sent by the ${esc(storeName)} inventory app.</td></tr>
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
}) {
  const cfg = await mailConfig();
  const log = async (status: "sent" | "failed", error?: string) => {
    await query(
      "INSERT INTO email_log (sent_by, kind, recipients, subject, attachments, status, error) VALUES ($1,$2,$3,$4,$5,$6,$7)",
      [opts.userId ?? null, opts.kind ?? "message", opts.to, opts.subject, (opts.attachments ?? []).map((a) => a.filename), status, error ?? null],
    ).catch(() => {});
  };
  if (!cfg) {
    await log("failed", "Email isn't set up");
    throw new Error("Email isn't set up yet. Add your mail account in Store Settings → Email.");
  }
  const transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.user ? { user: cfg.user, pass: cfg.pass ?? "" } : undefined,
    tls: process.env.SMTP_ALLOW_SELF_SIGNED === "true" ? { rejectUnauthorized: false } : undefined,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 30000,
  });
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
    const msg = (e as Error).message;
    await log("failed", msg);
    throw new Error(friendlySmtpError(msg));
  }
}

function friendlySmtpError(msg: string) {
  if (/Invalid login|535|Username and Password not accepted|BadCredentials/i.test(msg)) {
    return "The mail account rejected the password. For Gmail, use an App Password (not your normal password).";
  }
  if (/ENOTFOUND|EAI_AGAIN/i.test(msg)) return "The mail server address couldn't be found. Check the SMTP server name.";
  if (/ETIMEDOUT|ECONNREFUSED|timeout/i.test(msg)) return "Couldn't reach the mail server. Check the server name and port (Gmail: smtp.gmail.com, port 465).";
  return `The mail server rejected the message: ${msg}`;
}
