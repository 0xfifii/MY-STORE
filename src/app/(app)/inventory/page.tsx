import Link from "next/link";
import { Boxes, Plus, Download, Pencil } from "@/components/hand-icons";
import { ChangePriceButton } from "@/components/price-dialog";
import { EmptyState, LinkButton, PageHeader } from "@/components/ui/primitives";
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
  name: { sort: "name", dir: "asc", label: "Name A to Z" },
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
        <ul className="stagger mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" data-testid="item-cards">
          {data.rows.map((it) => {
            const min = Number(it.min_stock_level);
            const qty = Number(it.quantity);
            const level = min > 0 ? Math.min(100, (qty / (min * 3)) * 100) : qty > 0 ? 100 : 0;
            const status = it.status === "out" ? "Out of stock" : it.status === "low" ? "Low stock" : "In stock";
            return (
              <li key={it.id} className="lift group relative flex flex-col overflow-hidden rounded-[var(--radius-card)] bg-paper shadow-[0_14px_34px_-22px_rgb(82_8_16/0.6)] ring-1 ring-burgundy/15">
                {/* Burgundy head: name and code */}
                <div className="relative overflow-hidden bg-gradient-to-br from-burgundy to-claret px-5 pb-4 pt-5 text-paper">
                  <div aria-hidden className="pointer-events-none absolute -right-10 -top-12 size-36 rounded-full bg-paper/10" />
                  <div className="relative flex items-start justify-between gap-3">
                    <Link href={`/items/${it.id}`} className="min-w-0">
                      <h2 className="line-clamp-2 text-[19px] font-semibold leading-[1.2] tracking-[-0.015em] underline-offset-4 group-hover:underline">{it.name}</h2>
                    </Link>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-[0.02em] ${it.status === "out" ? "bg-paper text-burgundy" : it.status === "low" ? "bg-paper/20 text-paper ring-1 ring-paper/70" : "bg-paper/10 text-paper/85"}`}>
                      {status}
                    </span>
                  </div>
                  <p className="relative mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-paper/70 tabular-nums">{it.sku}</span>
                    <span className="text-[12px] font-medium text-paper/85">{it.category_name ?? "Uncategorised"}</span>
                  </p>
                </div>

                {/* Cream body: balance and worth */}
                <div className="flex flex-1 flex-col px-5 pb-4 pt-4 text-burgundy">
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-burgundy/60">In stock</p>
                      <p className="mt-0.5 text-[42px] font-semibold leading-none tracking-[-0.035em] tabular-nums">
                        {formatQty(it.quantity)}
                        <span className="ml-1.5 text-[15px] font-medium tracking-normal text-burgundy/60">{it.unit_symbol}</span>
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-burgundy/60">Worth</p>
                      <p className="mt-0.5 text-[17px] font-semibold tracking-[-0.01em] tabular-nums">{formatMoney(it.stock_value, sym)}</p>
                      <p className="text-[11px] text-burgundy/60 tabular-nums">{formatUnitCost(it.avg_cost, sym)} / {it.unit_symbol}</p>
                    </div>
                  </div>

                  <div className="mt-4" aria-hidden>
                    <div className="h-2 overflow-hidden rounded-full bg-burgundy/10">
                      <div className={`h-full rounded-full bg-burgundy transition-[width] duration-700 ease-out ${it.status === "in_stock" ? "" : "opacity-60"}`} style={{ width: `${level}%` }} />
                    </div>
                    <p className="mt-1.5 flex justify-between text-[11px] font-medium text-burgundy/60 tabular-nums">
                      <span>Minimum {formatQty(it.min_stock_level)} {it.unit_symbol}</span>{min > 0 && <span>{Math.round((qty / min) * 100)}% of minimum</span>}
                    </p>
                  </div>

                  <div className="mt-auto flex items-center justify-between gap-2 border-t border-burgundy/10 pt-4">
                    <StockButtons itemId={it.id} name={it.name} />
                    <div className="flex gap-1.5">
                      <ChangePriceButton itemId={it.id} label={`Change the price of ${it.name}`}
                        className="flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-[13px] font-bold text-burgundy ring-1 ring-burgundy/25 transition hover:scale-110 hover:bg-burgundy hover:text-paper active:scale-95">
                        {sym}
                      </ChangePriceButton>
                      {can(user, "item.write") && (
                        <Link href={`/items/${it.id}/edit`} aria-label={`Edit ${it.name}`}
                          className="flex size-8 items-center justify-center rounded-full text-burgundy ring-1 ring-burgundy/25 transition hover:scale-110 hover:bg-burgundy hover:text-paper active:scale-95">
                          <Pencil className="size-3.5" />
                        </Link>
                      )}
                      {can(user, "item.delete") && <DeleteItemButton compact itemId={it.id} name={it.name} quantity={it.quantity} unit={it.unit_symbol} />}
                    </div>
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
