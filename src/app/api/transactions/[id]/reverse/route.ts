import { handle, ok, readJson } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { reverseTransaction } from "@/lib/inventory";
import { reverseSchema } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle<Ctx>(async (req, { params }) => {
  const user = await requireApiUser("txn.reverse");
  const { id } = await params;
  const input = reverseSchema.parse(await readJson(req));
  const txn = await reverseTransaction(id, input.reason, input.request_id, user.id);
  return ok({ txn }, 201);
});
