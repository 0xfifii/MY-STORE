import { z } from "zod";
import { handle, ok, readJson } from "@/lib/api";
import { requirePlatformAdmin } from "@/lib/auth";
import { createBusiness, createInvite, emailInvite, listBusinesses } from "@/lib/businesses";

const schema = z.object({
  name: z.string().trim().min(1, "Enter the business name").max(120),
  owner_email: z.string().trim().toLowerCase().email("Enter the owner's email"),
  price_naira: z.coerce.number().min(0).max(100_000_000),
  free_days: z.coerce.number().int().min(0).max(366).default(0),
  billing_email: z.string().trim().toLowerCase().email().optional().nullable().or(z.literal("")),
  notes: z.string().trim().max(1000).optional().nullable(),
});

export const GET = handle(async () => {
  await requirePlatformAdmin();
  return ok({ businesses: await listBusinesses() });
});

/** New business: created, then handed to its owner by an emailed invitation. */
export const POST = handle(async (req) => {
  const me = await requirePlatformAdmin();
  const b = schema.parse(await readJson(req));
  // Starts paused-until-paid unless free days are given (the account locks when the paid period ends).
  const paidUntil = new Date(Date.now() + b.free_days * 86400_000);
  const id = await createBusiness({ name: b.name, priceKobo: Math.round(b.price_naira * 100), paidUntil, billingEmail: b.billing_email || b.owner_email, notes: b.notes });
  const link = await createInvite({ storeId: id, email: b.owner_email, role: "owner", demotePrevious: true, by: me.id });
  const email = await emailInvite(id, b.owner_email, link, "owner");
  return ok({ id, invite_link: link, email }, 201);
});
