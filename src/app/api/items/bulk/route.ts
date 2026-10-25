import { randomUUID } from "node:crypto";
import { z } from "zod";
import { handle, ok, readJson } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { query, queryOne } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { createItem } from "@/lib/inventory";
import { can } from "@/lib/permissions";
import { itemCreateSchema } from "@/lib/validation";

const schema = z.object({
  category_id: z.coerce.number().int().positive().optional().nullable(),
  category_name: z.string().trim().max(120).optional().nullable(),
  unit_id: z.coerce.number().int().positive({ message: "Choose a unit" }),
  rows: z.array(z.object({
    name: z.string().trim().min(1).max(200),
    quantity: z.string().trim().regex(/^\d+(\.\d{1,6})?$/, "Quantity must be a number"),
    unit_cost: z.string().trim().regex(/^\d+(\.\d{1,6})?$/).optional().nullable(),
  })).min(1, "Add at least one item").max(300, "Add up to 300 items at a time"),
});

/**
 * Adds many items at once (pasted list). Each gets its opening stock as its first Stock In.
 * Names that already exist in this business are skipped, so sending the same list twice adds nothing new.
 */
export const POST = handle(async (req) => {
  const user = await requireApiUser("item.write");
  const b = schema.parse(await readJson(req));
  const unit = await queryOne<{ allow_decimal: boolean }>("SELECT allow_decimal FROM units WHERE id = $1 AND archived_at IS NULL", [b.unit_id]);
  if (!unit) throw new AppError("INVALID_UNIT", "Choose a valid unit.");

  let categoryId = b.category_id ?? null;
  if (!categoryId && b.category_name) {
    const found = await queryOne<{ id: number }>("SELECT id FROM categories WHERE lower(name) = lower($1)", [b.category_name]);
    if (found) categoryId = found.id;
    else {
      if (!can(user, "catalog.write")) throw new AppError("FORBIDDEN", "You can't create categories. Pick an existing one.", 403);
      const c = await queryOne<{ id: number }>("INSERT INTO categories (name) VALUES ($1) RETURNING id", [b.category_name]);
      categoryId = c!.id;
      await audit(user.id, "category.create", "category", categoryId, { name: b.category_name });
    }
  }

  const existing = new Set((await query<{ n: string }>("SELECT lower(name) AS n FROM items")).map((r) => r.n));
  const created: { id: string; name: string }[] = [];
  const skipped: { name: string; reason: string }[] = [];
  for (const r of b.rows) {
    if (existing.has(r.name.toLowerCase())) { skipped.push({ name: r.name, reason: "already in your inventory" }); continue; }
    if (!unit.allow_decimal && Number(r.quantity) % 1 !== 0) { skipped.push({ name: r.name, reason: "this unit only takes whole numbers" }); continue; }
    try {
      const input = itemCreateSchema.parse({
        name: r.name, unit_id: b.unit_id, category_id: categoryId, allow_fraction: unit.allow_decimal,
        opening_quantity: r.quantity, opening_unit_cost: r.unit_cost || "0", request_id: randomUUID(),
      });
      const res = await createItem(input, user.id);
      created.push({ id: res.id, name: r.name });
      existing.add(r.name.toLowerCase());
    } catch (e) {
      skipped.push({ name: r.name, reason: (e as Error).message });
    }
  }
  return ok({ created, skipped, category_id: categoryId }, 201);
});
