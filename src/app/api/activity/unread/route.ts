import { handle, ok } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { unreadActivity } from "@/lib/activity";
import { can } from "@/lib/permissions";

/** Bell badge: how many new things other people did since this user last opened Activity. */
export const GET = handle(async () => {
  const me = await requireApiUser("view");
  if (!can(me, "activity.view")) return ok({ count: 0, latest: [], enabled: false });
  return ok({ ...(await unreadActivity(me.id)), enabled: true });
});
