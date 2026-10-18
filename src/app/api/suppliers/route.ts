import { handle, ok, readJson } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { listSuppliers } from "@/lib/catalog";
import { queryOne } from "@/lib/db";
import { supplierSchema } from "@/lib/validation";

export const GET = handle(async () => {
  await requireApiUser("view");
  return ok({ suppliers: await listSuppliers() });
});

export const POST = handle(async (req) => {
  const user = await requireApiUser("catalog.write");
  const s = supplierSchema.parse(await readJson(req));
  const row = await queryOne<{ id: number; name: string }>(
    `INSERT INTO suppliers (name, contact_person, phone, email, address, notes)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, name`,
    [s.name, s.contact_person, s.phone, s.email, s.address, s.notes],
  );
  await audit(user.id, "supplier.create", "supplier", row!.id, { name: s.name });
  return ok({ supplier: row }, 201);
});
