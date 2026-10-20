import "server-only";
import { queryOne } from "./db";
import { AppError } from "./errors";
import { sendMail, type MailKind, type MailPayload } from "./mailer";
import { loadReceipt, receiptFileName, receiptPdf } from "./receipt";
import { buildAndRender } from "./reports/render";
import { normaliseParams } from "./reports/engine";
import { auditFileName, auditReportPdf, auditReportXlsx, buildAuditReport } from "./audit-report";
import { getSettings } from "./settings";
import { sendWelcomeEmail } from "./notify";
import type { Role } from "./permissions";

/**
 * Sends a logged email again (to the same people or new addresses). Attachments are rebuilt
 * from the stored recipe, so a receipt or report reflects the records as they are now.
 */
export async function resendEmail(logId: string, by: { id: string; name: string; email: string }, opts: { to?: string[]; url: string }) {
  if (!/^\d+$/.test(logId)) throw new AppError("NOT_FOUND", "Email not found.", 404);
  const row = await queryOne<{ id: string; kind: MailKind; recipients: string[]; subject: string; payload: MailPayload | null }>(
    "SELECT id::text, kind, recipients, subject, payload FROM email_log WHERE id = $1",
    [logId],
  );
  if (!row) throw new AppError("NOT_FOUND", "Email not found.", 404);
  if (!row.payload) throw new AppError("CANT_RESEND", "This email was sent before resending was available. Send it again from its page instead.", 409);
  if (row.kind === "scheduled") throw new AppError("CANT_RESEND", "Automatic reports can be downloaded from Report History and sent from Send Email.", 409);
  const to = opts.to?.length ? opts.to : row.recipients;
  const p = row.payload;

  if (p.attach?.kind === "welcome") {
    const u = await queryOne<{ id: string; name: string; email: string; role: Role }>("SELECT id, name, email, role FROM users WHERE id = $1", [p.attach.userId]);
    if (!u) throw new AppError("NOT_FOUND", "That user no longer exists.", 404);
    const r = await sendWelcomeEmail({ ...u, email: to[0] ?? u.email, password: null }, { by, url: opts.url, force: true, resendOf: row.id });
    if (r.status !== "sent") throw new AppError("EMAIL_FAILED", r.detail ?? "The welcome email could not be sent.", 502);
    return { to: [to[0] ?? u.email] };
  }

  const attachments: { filename: string; content: Buffer; contentType?: string }[] = [];
  if (p.attach?.kind === "receipt") {
    const { t, s } = await loadReceipt(p.attach.txnId);
    attachments.push({ filename: receiptFileName(t), content: await receiptPdf(t, s), contentType: "application/pdf" });
  } else if (p.attach?.kind === "report") {
    const s = await getSettings();
    const r = await buildAndRender(normaliseParams({ preset: p.attach.preset }, s.timezone), p.attach.format, s);
    attachments.push({ filename: r.fileName, content: r.content, contentType: r.mime });
  } else if (p.attach?.kind === "audit") {
    const data = await buildAuditReport(p.attach.month, by.name);
    attachments.push({ filename: auditFileName(p.attach.month, p.attach.format), content: p.attach.format === "pdf" ? await auditReportPdf(data) : await auditReportXlsx(data) });
  }
  try {
    await sendMail({
      to, subject: row.subject, text: p.text, html: p.html, replyTo: p.replyTo ?? by.email, attachments,
      kind: row.kind, userId: by.id, payload: p.attach ? { attach: p.attach } : {}, resendOf: row.id,
    });
  } catch (e) {
    throw new AppError("EMAIL_FAILED", (e as Error).message, 502);
  }
  return { to };
}
