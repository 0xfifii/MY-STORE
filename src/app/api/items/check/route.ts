import { handle, ok } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { findSimilarItems, skuExists } from "@/lib/inventory";

/** Duplicate guard used by the item form while typing. */
export const GET = handle(async (req) => {
  await requireApiUser("view");
  const sp = req.nextUrl.searchParams;
  const name = sp.get("name") ?? "";
  const sku = sp.get("sku") ?? "";
  const exclude = sp.get("exclude") || undefined;
  const [similar, skuTaken] = await Promise.all([
    name.trim().length >= 2 ? findSimilarItems(name, exclude) : Promise.resolve([]),
    sku.trim() ? skuExists(sku, exclude) : Promise.resolve(false),
  ]);
  return ok({ similar, skuTaken });
});
