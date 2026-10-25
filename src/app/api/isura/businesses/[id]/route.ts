import { z } from "zod";
import { handle, ok, readJson } from "@/lib/api";
import { requirePlatformAdmin } from "@/lib/auth";
import { getBusiness } from "@/lib/businesses";
import { query, withStore } from "@/lib/db";
import { AppError } from "@/lib/errors";

type Ctx = { params: Promise<{ id: string }> };
const schema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  price_naira: z.coerce.number().min(0).max(100_000_000).optional(),
  status: z.enum(["active", "paused"]).optional(),
  billing_email: z.string().trim().toLowerCase().email().optional().nullable().or(z.literal("")),
  notes: z.string().trim().max(1000).optional().nullable(),
  /** "YYYY-MM-DD" to set the end date directly, or null for no end date */
  paid_until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

/** Change a business: name, monthly price, pause / resume, end date. */
export const PATCH = handle<Ctx>(async (req, { params }) => {
  await requirePlatformAdmin();
  const id = Number((await params).id);
  if (!(await getBusiness(id))) throw new AppError("NOT_FOUND", "Business not found.", 404);
  const b = schema.parse(await readJson(req));
  await withStore(null, () => query(
    `UPDATE stores SET name = coalesce($2, name), price_kobo = coalesce($3, price_kobo), status = coalesce($4, status),
            billing_email = CASE WHEN $5::boolean THEN nullif($6, '') ELSE billing_email END,
            notes = CASE WHEN $7::boolean THEN $8 ELSE notes END,
            paid_until = CASE WHEN $9::boolean THEN ($10::date + interval '1 day' - interval '1 second') AT TIME ZONE 'Africa/Lagos' ELSE paid_until END
      WHERE id = $1`,
    [id, b.name ?? null, b.price_naira === undefined ? null : Math.round(b.price_naira * 100), b.status ?? null,
     b.billing_email !== undefined, b.billing_email ?? "", b.notes !== undefined, b.notes ?? null,
     b.paid_until !== undefined, b.paid_until ?? null],
  ));
  if (b.name) await withStore(id, () => query("UPDATE settings SET store_name = $1, updated_at = now()", [b.name]));
  return ok({ business: await getBusiness(id) });
});
