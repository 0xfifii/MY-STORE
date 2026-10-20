import "server-only";
import { emailHtml, sendMail, smtpConfigured } from "./mailer";
import { ROLE_LABELS, type Role } from "./permissions";
import { getSettings } from "./settings";

export function appUrl(req?: Request) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (req) return new URL(req.url).origin;
  return "";
}

/**
 * Welcome email for a newly added user. Never throws: returns what happened so the caller can tell
 * the owner ("sent", "off", "not_configured" or "failed: …").
 */
export async function sendWelcomeEmail(
  u: { id?: string; name: string; email: string; role: Role; password?: string | null },
  opts: { by: { id: string; name: string }; url: string; force?: boolean; resendOf?: string | null },
): Promise<{ status: "sent" | "off" | "not_configured" | "failed"; detail?: string }> {
  const s = await getSettings();
  if (!s.welcome_email_enabled && !opts.force) return { status: "off" };
  const configured = await smtpConfigured();
  const login = `${opts.url}/login`;
  const lines = [
    `Hello ${u.name},`,
    `${opts.by.name} has given you access to ${s.store_name}'s inventory app as ${ROLE_LABELS[u.role]}.`,
    `Sign in at: ${login}\nEmail: ${u.email}` + (u.password ? `\nPassword: ${u.password}` : `\nPassword: ask ${opts.by.name} for your password.`),
    u.password ? "Please keep this password private. Ask the store owner if you need it changed." : "",
  ].filter(Boolean);
  const text = lines.join("\n\n");
  try {
    await sendMail({
      to: [u.email],
      subject: `Welcome to ${s.store_name}`,
      text,
      html: emailHtml(s.store_name, `Welcome, ${u.name}`, text, { label: "Sign in", href: login }),
      kind: "welcome",
      userId: opts.by.id,
      // The password is never stored for resending; a resend tells them to ask the owner.
      payload: u.id ? { attach: { kind: "welcome", userId: u.id } } : {},
      resendOf: opts.resendOf ?? null,
    });
    return { status: "sent" };
  } catch (e) {
    // Logged as failed either way, so it can be resent from Users or Send Email once email works.
    return { status: configured ? "failed" : "not_configured", detail: (e as Error).message };
  }
}
