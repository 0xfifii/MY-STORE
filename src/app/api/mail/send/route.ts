import { z } from "zod";
import { handle, ok, readJson } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { AppError } from "@/lib/errors";
import { emailHtml, sendMail } from "@/lib/mailer";
import { getSettings } from "@/lib/settings";
import { normaliseParams } from "@/lib/reports/engine";
import { buildAndRender } from "@/lib/reports/render";
import { auditFileName, auditReportPdf, auditReportXlsx, buildAuditReport, monthLabel } from "@/lib/audit-report";
import { emailListSchema } from "@/lib/validation";

const schema = z.object({
  to: emailListSchema,
  subject: z.string().trim().min(1, "Add a subject").max(200),
  message: z.string().trim().min(1, "Write a message").max(10000),
  attach: z
    .discriminatedUnion("kind", [
      z.object({ kind: z.literal("none") }),
      z.object({ kind: z.literal("report"), preset: z.enum(["today", "yesterday", "this_week", "last_week", "this_month", "last_month"]), format: z.enum(["pdf", "xlsx", "csv"]) }),
      z.object({ kind: z.literal("audit"), month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), format: z.enum(["pdf", "xlsx"]) }),
    ])
    .default({ kind: "none" }),
});

/** Send an email from the app, optionally with a report or the monthly audit report attached. */
export const POST = handle(async (req) => {
  const user = await requireApiUser("mail.send");
  const b = schema.parse(await readJson(req));
  const s = await getSettings();
  const attachments: { filename: string; content: Buffer; contentType?: string }[] = [];
  if (b.attach.kind === "report") {
    const r = await buildAndRender(normaliseParams({ preset: b.attach.preset }, s.timezone), b.attach.format, s);
    attachments.push({ filename: r.fileName, content: r.content, contentType: r.mime });
  } else if (b.attach.kind === "audit") {
    if (!can(user, "audit.view")) throw new AppError("FORBIDDEN", "You don't have access to the audit report.", 403);
    const data = await buildAuditReport(b.attach.month, user.name);
    const content = b.attach.format === "pdf" ? await auditReportPdf(data) : await auditReportXlsx(data);
    attachments.push({ filename: auditFileName(b.attach.month, b.attach.format), content });
  }
  const text = `${b.message}\n\n- ${user.name}, ${s.store_name}` + (attachments.length ? `\n\nAttached: ${attachments.map((a) => a.filename).join(", ")}` : "");
  try {
    await sendMail({
      to: b.to, subject: b.subject, text, html: emailHtml(s.store_name, b.subject, text), attachments,
      kind: b.attach.kind === "audit" ? "audit_report" : b.attach.kind === "report" ? "report" : "message",
      userId: user.id, replyTo: user.email,
      payload: b.attach.kind === "none" ? {} : { attach: b.attach.kind === "report" ? { kind: "report", preset: b.attach.preset, format: b.attach.format } : { kind: "audit", month: b.attach.month, format: b.attach.format } },
    });
  } catch (e) {
    throw new AppError("EMAIL_FAILED", (e as Error).message, 502);
  }
  return ok({ sent: b.to, attachments: attachments.map((a) => a.filename), month: b.attach.kind === "audit" ? monthLabel(b.attach.month) : undefined });
});
