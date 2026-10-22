import { notFound } from "next/navigation";
import { ItemForm } from "@/components/item-form";
import { PageHeader } from "@/components/ui/primitives";
import { requirePageUser } from "@/lib/auth";
import { listCategories, listSuppliers, listUnits } from "@/lib/catalog";
import { queryOne } from "@/lib/db";
import { getItem } from "@/lib/inventory";
import { plainQty } from "@/lib/format";

export const metadata = { title: "Edit Item" };

export default async function EditItemPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePageUser("item.write");
  const { id } = await params;
  const item = await getItem(id);
  if (!item) notFound();
  const [categories, units, suppliers, hasTxn] = await Promise.all([
    listCategories(), listUnits(), listSuppliers(),
    queryOne("SELECT 1 FROM stock_transactions WHERE item_id = $1 LIMIT 1", [id]),
  ]);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={`Edit ${item.name}`}
        description="Balances can't be edited here. They only change through Stock In, Stock Out and corrections." />
      <ItemForm
        mode="edit"
        unitLocked={!!hasTxn}
        initial={{
          id: item.id, name: item.name, sku: item.sku, category_id: item.category_id ? String(item.category_id) : "",
          description: item.description ?? "", unit_id: String(item.unit_id), allow_fraction: item.allow_fraction,
          min_stock_level: plainQty(item.min_stock_level), default_supplier_id: item.default_supplier_id ? String(item.default_supplier_id) : "",
          notes: item.notes ?? "",
          price: Number(item.quantity) > 0 ? String(Math.round(Number(item.avg_cost) * 100) / 100) : item.price ? String(Math.round(Number(item.price) * 100) / 100) : "",
        }}
        stock={{ quantity: item.quantity, stock_value: item.stock_value }}
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        units={units.map((u) => ({ id: u.id, name: u.name, symbol: u.symbol, allow_decimal: u.allow_decimal }))}
        suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
      />
    </div>
  );
}
