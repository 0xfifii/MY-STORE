import { z } from "zod";
import { handle, ok, readJson } from "@/lib/api";
import { requirePlatformAdmin } from "@/lib/auth";
import { createInvite, emailInvite, getBusiness } from "@/lib/businesses";
import { AppError } from "@/lib/errors";

type Ctx = { params: Promise<{ id: string }> };
const schema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  role: z.enum(["owner", "staff", "viewer"]).default("owner"),
  demote_previous: z.boolean().default(true),
});

/** Hand a business to a new owner (or invite someone) by email. */
export const POST = handle<Ctx>(async (req, { params }) => {
  const me = await requirePlatformAdmin();
  const id = Number((await params).id);
  if (!(await getBusiness(id))) throw new AppError("NOT_FOUND", "Business not found.", 404);
  const b = schema.parse(await readJson(req));
  const link = await createInvite({ storeId: id, email: b.email, role: b.role, demotePrevious: b.demote_previous, by: me.id });
  const email = await emailInvite(id, b.email, link, b.role);
  return ok({ invite_link: link, email }, 201);
});
