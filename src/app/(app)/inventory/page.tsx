import Link from "next/link";
import { Boxes, Plus, Download, Pencil } from "@/components/hand-icons";
import { ChangePriceButton } from "@/components/price-dialog";
import { EmptyState, LinkButton, PageHeader } from "@/components/ui/primitives";
import { Pagination } from "@/components/list-filters";
import { InventoryFilters } from "@/components/inventory-filters";
import { PhotoPlaceholder } from "@/components/item-photo";
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
        description="Every valuable, accounted for. Tap In or Out on any card."
        actions={
          <>
            <a href="/api/reports/export?kind=balance&preset=today&format=xlsx" className="inline-flex h-10 items-center gap-2 rounded-full bg-white px-5 text-sm font-semibold shadow-sm ring-1 ring-black/10 transition hover:-translate-y-px hover:shadow-md">
              <Download className="size-4" /> Balance sheet
            </a>
            {can(user, "item.write") && <LinkButton href="/items/new"><Plus className="size-4" /> Add New Item</LinkButton>}
          </>
        }
      />

      <InventoryFilters
        categories={categories.map((c) => ({ id: c.id, name: c.name, count: c.item_count }))}
        sorts={Object.entries(SORTS).map(([value, v]) => [value === "name" ? "" : value, v.label])}
        total={data.total}
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
        <ul className="stagger mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" data-testid="item-cards">
          {data.rows.map((it) => {
            const min = Number(it.min_stock_level);
            const qty = Number(it.quantity);
            const level = min > 0 ? Math.min(100, (qty / (min * 3)) * 100) : qty > 0 ? 100 : 0;
            const status = it.status === "out" ? "Out of stock" : it.status === "low" ? "Running low" : "In stock";
            return (
              <li key={it.id} className="product-card group relative flex flex-col rounded-[28px] bg-white p-3 shadow-[0_18px_40px_-30px_rgb(0_0_0/0.7)] ring-1 ring-black/5">
                {/* Photo, or black tile with the item's initials */}
                <Link href={`/items/${it.id}`} className="relative block aspect-[16/11] overflow-hidden rounded-[22px]" aria-label={`Open ${it.name}`}>
                  {it.has_photo
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={`/api/items/${it.id}/photo?v=${it.photo_v}`} alt="" loading="lazy" className="size-full object-cover grayscale transition duration-500 group-hover:scale-[1.04] group-hover:grayscale-0" />
                    : <PhotoPlaceholder name={it.name} className="size-full transition duration-500 group-hover:scale-[1.04]" />}
                  <span className={`absolute left-3 top-3 rounded-lg px-2.5 py-1 text-[11px] font-bold shadow-sm ${it.status === "out" ? "bg-white text-[#111111]" : it.status === "low" ? "bg-[#111111] text-white ring-1 ring-white/60" : "bg-white/90 text-[#111111]"}`}>
                    {status}
                  </span>
                  <span className="absolute bottom-3 right-3 rounded-lg bg-white/95 px-2.5 py-1 text-[12px] font-bold text-[#111111] shadow-sm tabular-nums">
                    {formatMoney(it.stock_value, sym)}
                  </span>
                </Link>

                {/* Name, category and the quantity on the right (like the distance pin in the reference) */}
                <div className="flex items-start justify-between gap-3 px-1.5 pt-3.5">
                  <div className="min-w-0">
                    <Link href={`/items/${it.id}`} className="block truncate text-[18px] font-bold leading-tight tracking-[-0.02em] text-[#111111] hover:underline">{it.name}</Link>
                    <p className="mt-0.5 truncate text-[13px] text-[#111111]/55">{it.category_name ?? "Uncategorised"} · <span className="tabular-nums">{it.sku}</span></p>
                  </div>
                  <p className="flex shrink-0 items-center gap-1.5 pt-0.5 text-[15px] font-bold tabular-nums text-[#111111]" title={`${formatQty(it.quantity)} ${it.unit_symbol} in stock`}>
                    <Boxes className="size-[18px]" />{formatQty(it.quantity)} <span className="text-[13px] font-semibold text-[#111111]/55">{it.unit_symbol}</span>
                  </p>
                </div>

                <div className="mx-1.5 mt-3" aria-hidden>
                  <div className="h-1.5 overflow-hidden rounded-full bg-black/[0.07]">
                    <div className="h-full rounded-full bg-[#111111] transition-[width] duration-700 ease-out" style={{ width: `${level}%` }} />
                  </div>
                  <p className="mt-1.5 flex justify-between text-[11px] font-medium text-[#111111]/50 tabular-nums">
                    <span>{formatUnitCost(it.avg_cost, sym)} / {it.unit_symbol}</span>
                    <span>Min {formatQty(it.min_stock_level)} {it.unit_symbol}</span>
                  </p>
                </div>

                <div className="mt-auto flex items-center justify-between gap-2 px-1 pt-3">
                  <StockButtons itemId={it.id} name={it.name} />
                  <div className="flex gap-1.5">
                    <ChangePriceButton itemId={it.id} label={`Change the price of ${it.name}`}
                      className="flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-[13px] font-bold text-[#111111] ring-1 ring-black/15 transition hover:scale-110 hover:bg-[#111111] hover:text-white active:scale-95">
                      {sym}
                    </ChangePriceButton>
                    {can(user, "item.write") && (
                      <Link href={`/items/${it.id}/edit`} aria-label={`Edit ${it.name}`}
                        className="flex size-8 items-center justify-center rounded-full text-[#111111] ring-1 ring-black/15 transition hover:scale-110 hover:bg-[#111111] hover:text-white active:scale-95">
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
