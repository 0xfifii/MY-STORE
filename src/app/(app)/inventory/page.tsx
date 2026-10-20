import Link from "next/link";
import { Boxes, Plus, Download, Pencil } from "lucide-react";
import { EmptyState, LinkButton, PageHeader, StatusBadge } from "@/components/ui/primitives";
import { ListFilters, Pagination } from "@/components/list-filters";
import { StockButtons } from "@/components/stock-dialog";
import { DeleteItemButton } from "@/components/item-actions";
import { requirePageUser } from "@/lib/auth";
import { listCategories } from "@/lib/catalog";
import { listItems, type ItemListParams } from "@/lib/inventory";
import { can } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { formatMoney, formatQty, formatUnitCost } from "@/lib/format";

export const metadata = { title: "Inventory" };

type SP = { q?: string; category?: string; status?: string; sort?: string; page?: string };

const SORTS: Record<string, { sort: ItemListParams["sort"]; dir: "asc" | "desc"; label: string }> = {
  name: { sort: "name", dir: "asc", label: "Name A–Z" },
  low: { sort: "quantity", dir: "asc", label: "Lowest balance" },
  high: { sort: "quantity", dir: "desc", label: "Highest balance" },
  value: { sort: "value", dir: "desc", label: "Highest worth" },
  recent: { sort: "updated", dir: "desc", label: "Recently moved" },
};

export default async function InventoryPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePageUser("view");
  const sp = await searchParams;
  const [s, categories] = await Promise.all([getSettings(), listCategories()]);
  const sortKey = sp.sort && SORTS[sp.sort] ? sp.sort : "name";
  const data = await listItems({
    q: sp.q,
    category: sp.category ? Number(sp.category) : null,
    status: (sp.status as ItemListParams["status"]) || null,
    sort: SORTS[sortKey].sort,
    dir: SORTS[sortKey].dir,
    page: Number(sp.page ?? 1) || 1,
    pageSize: 24,
  });
  const sym = s.currency_symbol;
  const filtered = Boolean(sp.q || sp.category || sp.status);

  return (
    <div>
      <PageHeader
        title="Inventory"
        description="Every item with its balance and worth. Tap In or Out on any card."
        actions={
          <>
            <a href="/api/reports/export?kind=balance&preset=today&format=xlsx" className="inline-flex h-10 items-center gap-2 rounded-full bg-white/80 px-5 text-sm font-semibold shadow-sm ring-1 ring-white hover:bg-white">
              <Download className="size-4" /> Balance sheet
            </a>
            {can(user, "item.write") && <LinkButton href="/items/new"><Plus className="size-4" /> Add New Item</LinkButton>}
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
          { name: "sort", label: "Sort", options: Object.entries(SORTS).map(([value, v]) => ({ value: value === "name" ? "" : value, label: v.label })) },
        ]}
      />

      {data.rows.length === 0 ? (
        <div className="glass mt-5 rounded-[var(--radius-card)]">
          <EmptyState
            icon={<Boxes className="size-6" />}
            title={filtered ? "No items match these filters" : "No items yet"}
            body={filtered ? "Try a different name or code, or clear the filters." : "Add the items your store keeps, with their unit and opening stock."}
            action={!filtered && can(user, "item.write") ? <LinkButton href="/items/new">Add New Item</LinkButton> : undefined}
          />
        </div>
      ) : (
        <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" data-testid="item-cards">
          {data.rows.map((it) => {
            const min = Number(it.min_stock_level);
            const qty = Number(it.quantity);
            const level = min > 0 ? Math.min(100, (qty / (min * 3)) * 100) : qty > 0 ? 100 : 0;
            return (
              <li key={it.id} className="glass group relative flex flex-col rounded-[var(--radius-card)] p-5">
                <div className="flex items-start justify-between gap-2">
                  <span className="truncate rounded-full bg-white/80 px-3 py-1 text-xs font-medium text-muted ring-1 ring-white">
                    {it.category_name ?? "Uncategorised"}
                  </span>
                  <StatusBadge status={it.status} />
                </div>

                <Link href={`/items/${it.id}`} className="mt-4 block">
                  <h2 className="line-clamp-2 text-lg font-semibold leading-snug group-hover:text-burgundy">{it.name}</h2>
                  <p className="text-xs text-muted">{it.sku}</p>
                </Link>

                <div className="mt-4 flex items-end justify-between gap-3">
                  <p className="text-[40px] font-light leading-none tracking-tight">
                    {formatQty(it.quantity)}
                    <span className="ml-1.5 text-base font-medium text-muted">{it.unit_symbol}</span>
                  </p>
                  <div className="text-right text-xs text-muted">
                    <p className="text-sm font-semibold text-ink">{formatMoney(it.stock_value, sym)}</p>
                    <p>{formatUnitCost(it.avg_cost, sym)} / {it.unit_symbol}</p>
                  </div>
                </div>

                <div className="mt-3" aria-hidden>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white ring-1 ring-white">
                    <div className={`h-full rounded-full ${it.status === "out" ? "bg-bad" : it.status === "low" ? "bg-warn" : "bg-burgundy"}`} style={{ width: `${level}%` }} />
                  </div>
                  <p className="mt-1 text-[11px] text-muted">Minimum {formatQty(it.min_stock_level)} {it.unit_symbol}</p>
                </div>

                <div className="mt-4 flex items-center justify-between gap-2 border-t border-white/80 pt-4">
                  <StockButtons itemId={it.id} name={it.name} />
                  <div className="flex gap-1.5">
                    {can(user, "item.write") && (
                      <Link href={`/items/${it.id}/edit`} aria-label={`Edit ${it.name}`}
                        className="flex size-8 items-center justify-center rounded-full bg-white/80 text-muted ring-1 ring-white hover:text-burgundy">
                        <Pencil className="size-3.5" />
                      </Link>
                    )}
                    {can(user, "item.delete") && <DeleteItemButton compact itemId={it.id} name={it.name} quantity={it.quantity} unit={it.unit_symbol} />}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <div className="glass mt-4 rounded-full">
        <Pagination page={data.page} pages={data.pages} total={data.total} label={data.total === 1 ? "item" : "items"} />
      </div>
    </div>
  );
}
