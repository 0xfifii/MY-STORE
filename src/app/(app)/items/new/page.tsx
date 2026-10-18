import { ItemForm } from "@/components/item-form";
import { PageHeader } from "@/components/ui/primitives";
import { requirePageUser } from "@/lib/auth";
import { listCategories, listSuppliers, listUnits } from "@/lib/catalog";

export const metadata = { title: "Add New Item" };

export default async function NewItemPage({ searchParams }: { searchParams: Promise<{ name?: string; then?: string }> }) {
  await requirePageUser("item.write");
  const sp = await searchParams;
  const [categories, units, suppliers] = await Promise.all([listCategories(), listUnits(), listSuppliers()]);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Add New Item"
        back={{ href: sp.then === "stock-in" ? "/stock-in" : "/inventory", label: sp.then === "stock-in" ? "Stock In" : "Inventory" }}
        description={sp.then === "stock-in" ? "Add the item first — you'll go straight back to Stock In afterwards." : undefined}
      />
      <ItemForm
        mode="create"
        thenStockIn={sp.then === "stock-in"}
        initial={{
          name: sp.name ?? "", sku: "", category_id: "", description: "", unit_id: "", allow_fraction: true,
          min_stock_level: "0", default_supplier_id: "", notes: "",
        }}
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        units={units.map((u) => ({ id: u.id, name: u.name, symbol: u.symbol, allow_decimal: u.allow_decimal }))}
        suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
      />
    </div>
  );
}
