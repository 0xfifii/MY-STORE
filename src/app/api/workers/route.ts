import { handle, ok, readJson } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { query, queryOne } from "@/lib/db";
import { workerSchema } from "@/lib/validation";

export const GET = handle(async () => {
  await requireApiUser("view");
  const workers = await query("SELECT id, name, department, phone FROM workers WHERE archived_at IS NULL ORDER BY lower(name)");
  return ok({ workers });
});

export const POST = handle(async (req) => {
  const user = await requireApiUser("workers.manage");
  const w = workerSchema.parse(await readJson(req));
  const row = await queryOne<{ id: number; name: string }>(
    "INSERT INTO workers (name, department, phone, notes) VALUES ($1,$2,$3,$4) RETURNING id, name",
    [w.name, w.department, w.phone, w.notes],
  );
  await audit(user.id, "worker.create", "worker", row!.id, { name: w.name, department: w.department });
  return ok({ worker: row }, 201);
});
