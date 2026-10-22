import { handle, ok, readJson } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { queryOne } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { unitSchema } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

/** Rename a custom unit or change whether it takes part quantities. Items using it follow automatically. */
export const PATCH = handle<Ctx>(async (req, { params }) => {
  const user = await requireApiUser("catalog.write");
  const id = Number((await params).id);
  const u = unitSchema.parse(await readJson(req));
  const cur = await queryOne<{ name: string; symbol: string; allow_decimal: boolean; is_system: boolean }>(
    "SELECT name, symbol, allow_decimal, is_system FROM units WHERE id = $1", [id]);
  if (!cur) throw new AppError("NOT_FOUND", "Unit not found.", 404);
  if (cur.is_system) throw new AppError("SYSTEM_UNIT", "Standard units can't be renamed. Add a custom unit instead.", 409);
  if (!u.allow_decimal && cur.allow_decimal) {
    const frac = await queryOne<{ name: string }>(
      "SELECT name FROM items WHERE unit_id = $1 AND quantity <> trunc(quantity) LIMIT 1", [id]);
    if (frac) throw new AppError("FRACTION_IN_STOCK", `${frac.name} holds a part quantity in this unit, so it can't be made whole numbers only.`, 409);
  }
  await queryOne("UPDATE units SET name = $2, symbol = $3, allow_decimal = $4 WHERE id = $1 RETURNING id", [id, u.name, u.symbol, u.allow_decimal]);
  await audit(user.id, "unit.update", "unit", id, { from: cur, to: u });
  return ok();
});
