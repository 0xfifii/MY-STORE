import { z } from "zod";
import { handle, ok, readJson } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { appUrl } from "@/lib/notify";
import { resendEmail } from "@/lib/resend";
import { emailListSchema } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

/** Resend a logged email (optionally to different addresses). */
export const POST = handle<Ctx>(async (req, { params }) => {
  const user = await requireApiUser("mail.send");
  const body = z.object({ to: emailListSchema.optional() }).parse(await readJson(req));
  return ok(await resendEmail((await params).id, user, { to: body.to, url: appUrl(req) }));
});

/** Sending email can take a while (mail server handshake, attachments). */
export const maxDuration = 60;
