import { handle, ok } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { searchItems } from "@/lib/audit-analytics";

/** Item search by name, code or category (audit item performance). */
export const GET = handle(async (req) => {
  await requireApiUser("audit.view");
  return ok({ items: await searchItems(req.nextUrl.searchParams.get("q") ?? "") });
});
