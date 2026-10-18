import Link from "next/link";
import { Boxes, Plus, Download } from "lucide-react";
import { EmptyState, LinkButton, PageHeader, StatusBadge } from "@/components/ui/primitives";
import { ListFilters, Pagination } from "@/components/list-filters";
import { SortHeader } from "@/components/sort-header";
import { StockButtons } from "@/components/stock-dialog";
import { requirePageUser } from "@/lib/auth";
import { listCategories } from "@/lib/catalog";
import { listItems, type ItemListParams } from "@/lib/inventory";
import { can } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { formatMoney, formatQty, formatUnitCost } from "@/lib/format";

export const metadata = { title: "Inventory" };

type SP = { q?: string; category?: string; status?: string; sort?: string; dir?: string; page?: string };

export default async function InventoryPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePageUser("view");
  const sp = await searchParams;
  const [s, categories] = await Promise.all([getSettings(), listCategories()]);
  const data = await listItems({
    q: sp.q,
    category: sp.category ? Number(sp.category) : null,
    status: (sp.status as ItemListParams["status"]) || null,
    sort: (["name", "quantity", "value", "sku"].includes(sp.sort ?? "") ? sp.sort : "name") as ItemListParams["sort"],
    dir: sp.dir === "desc" ? "desc" : "asc",
    page: Number(sp.page ?? 1) || 1,
    pageSize: 25,
  });
  const sym = s.currency_symbol;
  const filtered = Boolean(sp.q || sp.category || sp.status);

  return (
    <div>
      <PageHeader
        title="Inventory"
        description="Every item, its balance and what it's worth. Use Stock In or Stock Out on any row."
        actions={
          <>
            <a href="/api/reports/export?kind=balance&preset=today&format=xlsx" className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-white px-4 text-sm font-semibold hover:bg-rose">
              <Download className="size-4" /> Balance sheet
            </a>
            {can(user.role, "item.write") && <LinkButton href="/items/new"><Plus className="size-4" /> Add New Item</LinkButton>}
          </>
        }
      />

      <ListFilters
        searchPlaceholder="Search by item name or code"
        selects={[
          { name: "category", label: "Category", options: [{ value: "", label: "All categories" }, ...categories.map((c) => ({ value: String(c.id), label: c.name }))] },
          { name: "status", label: "Stock status", options: [
            { value: "", label: "Any status" }, { value: "in_stock", label: "In stock" }, { value: "low", label: "Low stock" },
            { value: "out", label: "Out of stock" }, { value: "attention", label: "Low or out" },
          ] },
        ]}
      />

      <div className="mt-4 overflow-hidden rounded-lg border border-line bg-white">
        {data.rows.length === 0 ? (
          <EmptyState
            icon={<Boxes className="size-6" />}
            title={filtered ? "No items match these filters" : "No items yet"}
            body={filtered ? "Try a different name or code, or clear the filters." : "Add the items your store keeps, with their unit and opening stock."}
            action={!filtered && can(user.role, "item.write") ? <LinkButton href="/items/new">Add New Item</LinkButton> : undefined}
          />
        ) : (
          <>
            {/* Desktop / tablet table */}
            <div className="hidden md:block">
              <table className="w-full text-sm">
                <thead className="border-b border-line bg-canvas text-muted">
                  <tr>
                    <SortHeader col="name" label="Item" />
                    <SortHeader col="sku" label="Code" className="hidden xl:table-cell" />
                    <th className="hidden px-4 py-3 text-left font-semibold xl:table-cell">Category</th>
                    <SortHeader col="quantity" label="Balance" align="right" />
                    <th className="hidden px-4 py-3 text-right font-semibold xl:table-cell">Cost / unit</th>
                    <SortHeader col="value" label="Stock worth" align="right" />
                    <th className="px-4 py-3 text-left font-semibold">Status</th>
                    <th className="px-4 py-3 text-right font-semibold"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.rows.map((it) => (
                    <tr key={it.id} className="hover:bg-rose/40">
                      <td className="max-w-64 px-4 py-3">
                        <Link href={`/items/${it.id}`} className="font-semibold hover:text-burgundy hover:underline">{it.name}</Link>
                        <span className="block text-xs text-muted xl:hidden">{it.sku}{it.category_name ? ` · ${it.category_name}` : ""}</span>
                      </td>
                      <td className="hidden px-4 py-3 text-muted xl:table-cell">{it.sku}</td>
                      <td className="hidden px-4 py-3 text-muted xl:table-cell">{it.category_name ?? "—"}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <span className="font-semibold">{formatQty(it.quantity)}</span> <span className="text-muted">{it.unit_symbol}</span>
                      </td>
                      <td className="hidden whitespace-nowrap px-4 py-3 text-right text-muted xl:table-cell">{formatUnitCost(it.avg_cost, sym)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-semibold">{formatMoney(it.stock_value, sym)}</td>
                      <td className="px-4 py-3"><StatusBadge status={it.status} /></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <StockButtons itemId={it.id} name={it.name} />
                          {can(user.role, "item.write") && (
                            <Link href={`/items/${it.id}/edit`} className="h-8 rounded-md px-2 text-xs font-semibold leading-8 text-muted hover:bg-rose hover:text-burgundy">Edit</Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Phone cards */}
            <ul className="divide-y divide-line md:hidden">
              {data.rows.map((it) => (
                <li key={it.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <Link href={`/items/${it.id}`} className="min-w-0">
                      <p className="truncate font-semibold">{it.name}</p>
                      <p className="truncate text-xs text-muted">{it.sku}{it.category_name ? ` · ${it.category_name}` : ""}</p>
                    </Link>
                    <div className="shrink-0 text-right">
                      <p className="font-display text-lg font-bold leading-tight">
                        {formatQty(it.quantity)} <span className="text-sm text-muted">{it.unit_symbol}</span>
                      </p>
                      <p className="text-xs text-muted">{formatMoney(it.stock_value, sym)}</p>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <StatusBadge status={it.status} />
                    <StockButtons itemId={it.id} name={it.name} />
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="border-t border-line">
          <Pagination page={data.page} pages={data.pages} total={data.total} label={data.total === 1 ? "item" : "items"} />
        </div>
      </div>
    </div>
  );
}
