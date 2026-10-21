import { z } from "zod";
import { handle, ok, readJson } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { emailHtml, sendMail, smtpConfigured } from "@/lib/mailer";
import { getSettings } from "@/lib/settings";

/** Sends a test email to the given address (default: the signed-in owner). */
export const POST = handle(async (req) => {
  const user = await requireApiUser("settings.write");
  const body = z.object({ to: z.string().email().optional() }).parse(await readJson(req).catch(() => ({})));
  if (!(await smtpConfigured())) {
    throw new AppError("SMTP_MISSING", "Email isn't set up yet. Fill in the mail account under Store Settings → Email and save.", 409);
  }
  const s = await getSettings();
  const to = body.to ?? user.email;
  const text = `This is a test email from ${s.store_name}.\n\nIf you can read this, emails from the app (receipts, reports and messages) will be delivered.`;
  try {
    const id = await sendMail({ to: [to], subject: `${s.store_name}: test email`, text, html: emailHtml(s.store_name, "Email is working", text), kind: "test", userId: user.id });
    return ok({ ok: true, messageId: id, to });
  } catch (e) {
    throw new AppError("SMTP_FAILED", (e as Error).message, 502);
  }
});

/** Sending email can take a while (mail server handshake, attachments). */
export const maxDuration = 60;
