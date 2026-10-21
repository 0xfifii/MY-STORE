import { handle, ok } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { markActivitySeen } from "@/lib/activity";

export const POST = handle(async () => {
  const me = await requireApiUser("view");
  await markActivitySeen(me.id);
  return ok();
});
