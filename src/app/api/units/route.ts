import { handle, ok, readJson } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { listGlobalConversions, listUnits } from "@/lib/catalog";
import { queryOne } from "@/lib/db";
import { unitSchema } from "@/lib/validation";

export const GET = handle(async () => {
  await requireApiUser("view");
  return ok({ units: await listUnits(), conversions: await listGlobalConversions() });
});

/** Custom units created by the user (e.g. "Tray", "Sachet", "Tin"). */
export const POST = handle(async (req) => {
  const user = await requireApiUser("catalog.write");
  const u = unitSchema.parse(await readJson(req));
  const row = await queryOne<{ id: number; name: string; symbol: string }>(
    "INSERT INTO units (name, symbol, allow_decimal) VALUES ($1,$2,$3) RETURNING id, name, symbol",
    [u.name, u.symbol, u.allow_decimal],
  );
  await audit(user.id, "unit.create", "unit", row!.id, u);
  return ok({ unit: row }, 201);
});
