import { PageHeader, Panel } from "@/components/ui/primitives";
import { StockMoveForm } from "@/components/stock-move-form";
import { requirePageUser } from "@/lib/auth";

export const metadata = { title: "Stock Out" };

export default async function StockOutPage({ searchParams }: { searchParams: Promise<{ item?: string }> }) {
  await requirePageUser("stock.move");
  const { item } = await searchParams;
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Stock Out" description="Record stock that's used, sold, moved or lost. You can't issue more than is available." />
      <Panel>
        <StockMoveForm key={item ?? "none"} mode="out" initialItemId={item ?? null} />
      </Panel>
    </div>
  );
}
