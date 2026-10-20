import { handle, ok } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { diagnoseMail } from "@/lib/mailer";

/** Connects and logs in to the saved mail account, step by step, without sending anything. */
export const POST = handle(async () => {
  await requireApiUser("settings.write");
  return ok(await diagnoseMail());
});
