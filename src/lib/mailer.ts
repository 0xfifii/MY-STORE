import "server-only";
import nodemailer from "nodemailer";

/** Email delivery is only active when SMTP_* variables are set. */
export function smtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);
}

export async function sendMail(opts: {
  to: string[];
  subject: string;
  text: string;
  attachments?: { filename: string; content: Buffer; contentType?: string }[];
}) {
  if (!smtpConfigured()) throw new Error("SMTP is not configured (set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM).");
  const port = Number(process.env.SMTP_PORT ?? 587);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    tls: process.env.SMTP_ALLOW_SELF_SIGNED === "true" ? { rejectUnauthorized: false } : undefined,
  });
  const info = await transport.sendMail({
    from: process.env.SMTP_FROM,
    to: opts.to.join(", "),
    subject: opts.subject,
    text: opts.text,
    attachments: opts.attachments,
  });
  return info.messageId as string;
}
