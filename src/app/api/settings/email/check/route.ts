import { handle, ok } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { diagnoseMail } from "@/lib/mailer";

/** Connects and logs in to the saved mail account, step by step, without sending anything. */
export const POST = handle(async () => {
  await requireApiUser("settings.write");
  return ok(await diagnoseMail());
});

/** Sending email can take a while (mail server handshake, attachments). */
export const maxDuration = 60;
