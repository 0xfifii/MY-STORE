import { handle, ok } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { queryOne } from "@/lib/db";
import { AppError } from "@/lib/errors";

type Ctx = { params: Promise<{ id: string }> };

// Removing a rule never changes past transactions: each one stores the factor it used.
export const DELETE = handle<Ctx>(async (_req, { params }) => {
  const user = await requireApiUser("conversion.global");
  const { id } = await params;
  const row = await queryOne("DELETE FROM unit_conversions WHERE id = $1 RETURNING from_unit_id, to_unit_id, factor", [Number(id)]);
  if (!row) throw new AppError("NOT_FOUND", "Rule not found.", 404);
  await audit(user.id, "unit_conversion.remove", "unit_conversion", id, row);
  return ok();
});
