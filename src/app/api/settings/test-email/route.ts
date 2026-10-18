import { handle, ok } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { sendMail, smtpConfigured } from "@/lib/mailer";
import { getSettings } from "@/lib/settings";

export const POST = handle(async () => {
  await requireApiUser("settings.write");
  if (!smtpConfigured()) {
    throw new AppError("SMTP_MISSING", "Email isn't set up on the server yet. Add the SMTP_* settings (see README) and redeploy.", 409);
  }
  const s = await getSettings();
  if (!s.email_recipients.length) throw new AppError("NO_RECIPIENTS", "Add at least one recipient email and save first.");
  try {
    const id = await sendMail({
      to: s.email_recipients,
      subject: `${s.store_name} — test email`,
      text: `This is a test email from ${s.store_name}. Daily reports will be delivered to this address.`,
    });
    return ok({ ok: true, messageId: id });
  } catch (e) {
    throw new AppError("SMTP_FAILED", `The mail server rejected the message: ${(e as Error).message}`, 502);
  }
});
