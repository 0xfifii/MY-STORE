import Link from "next/link";
import clsx from "clsx";
import { PageHeader, Panel } from "@/components/ui/primitives";
import { StockMoveForm } from "@/components/stock-move-form";
import { StockOutBatchForm } from "@/components/stock-out-batch-form";
import { requirePageUser } from "@/lib/auth";

export const metadata = { title: "Stock Out" };

export default async function StockOutPage({ searchParams }: { searchParams: Promise<{ item?: string; mode?: string }> }) {
  await requirePageUser("stock.out");
  const { item, mode } = await searchParams;
  const many = mode === "many" && !item;
  const tab = (on: boolean) => clsx(
    "flex-1 rounded-xl px-3 py-2 text-center text-sm font-semibold transition",
    on ? "bg-[#111111] text-white shadow" : "text-[#111111]/60 hover:text-[#111111]",
  );
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Stock Out"
        description={many
          ? "One worker taking several items: add up to 20, each with its quantity and reason. They're saved together."
          : "Record stock that's used, sold, moved or lost. You can't issue more than is available."} />
      <nav className="mb-4 flex gap-1 rounded-2xl bg-white p-1 ring-1 ring-black/5" aria-label="Stock out mode">
        <Link href="/stock-out" className={tab(!many)} aria-current={!many ? "page" : undefined}>One item</Link>
        <Link href="/stock-out?mode=many" className={tab(many)} aria-current={many ? "page" : undefined} data-testid="tab-many">Several items</Link>
      </nav>
      <Panel>
        {many ? <StockOutBatchForm /> : <StockMoveForm key={item ?? "none"} mode="out" initialItemId={item ?? null} />}
      </Panel>
    </div>
  );
}
