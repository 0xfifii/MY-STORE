import { PageHeader } from "@/components/ui/primitives";
import { CatalogManager } from "@/components/catalog-manager";
import { requirePageUser } from "@/lib/auth";
import { listCategories } from "@/lib/catalog";
import { can } from "@/lib/permissions";

export const metadata = { title: "Categories" };

export default async function CategoriesPage() {
  const user = await requirePageUser("view");
  const rows = await listCategories(true);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Categories" description="Group items so the inventory list and reports are easier to filter." />
      <CatalogManager
        rows={rows.map((r) => ({ ...r, title: r.name, subtitle: [`${r.item_count} item${r.item_count === 1 ? "" : "s"}`, r.description].filter(Boolean).join(" · ") }))}
        endpoint="/api/categories"
        noun="Category"
        canWrite={can(user.role, "catalog.write")}
        canArchive={can(user.role, "item.archive")}
        fields={[{ key: "name", label: "Name", required: true }, { key: "description", label: "Description", type: "textarea" }]}
        emptyBody="Add categories like Grains, Beverages, Cleaning or Kitchen supplies."
      />
    </div>
  );
}
