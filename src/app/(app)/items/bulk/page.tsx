import { PageHeader } from "@/components/ui/primitives";
import { requirePageUser } from "@/lib/auth";
import { listCategories, listUnits } from "@/lib/catalog";
import { can } from "@/lib/permissions";
import { BulkAdd } from "./bulk-add";

export const metadata = { title: "Add many items" };

export default async function BulkAddPage() {
  const user = await requirePageUser("item.write");
  const [categories, units] = await Promise.all([listCategories(), listUnits()]);
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Add many items" description="Paste a list, one item per line with its quantity. Check the preview, then save them all at once." />
      <BulkAdd
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        units={units.map((u) => ({ id: u.id, name: u.name, symbol: u.symbol, allow_decimal: u.allow_decimal }))}
        canNewCategory={can(user, "catalog.write")}
      />
    </div>
  );
}
