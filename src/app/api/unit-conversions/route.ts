import { handle, ok, readJson } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { queryOne } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { globalConversionSchema } from "@/lib/validation";

/** Global rule between two compatible units (owner only), e.g. 1 kg = 1000 g. */
export const POST = handle(async (req) => {
  const user = await requireApiUser("conversion.global");
  const c = globalConversionSchema.parse(await readJson(req));
  if (c.from_unit_id === c.to_unit_id) throw new AppError("SAME_UNIT", "Pick two different units.");
  const reverse = await queryOne("SELECT 1 FROM unit_conversions WHERE from_unit_id = $1 AND to_unit_id = $2", [c.to_unit_id, c.from_unit_id]);
  if (reverse) throw new AppError("EXISTS", "A rule between these two units already exists (in the other direction).", 409);
  const row = await queryOne<{ id: number }>(
    `INSERT INTO unit_conversions (from_unit_id, to_unit_id, factor) VALUES ($1,$2,$3)
     ON CONFLICT (from_unit_id, to_unit_id) DO UPDATE SET factor = EXCLUDED.factor RETURNING id`,
    [c.from_unit_id, c.to_unit_id, c.factor],
  );
  await audit(user.id, "unit_conversion.set", "unit_conversion", row!.id, c);
  return ok({ id: row!.id }, 201);
});
