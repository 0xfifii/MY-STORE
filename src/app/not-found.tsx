import Link from "next/link";
import { Mascot } from "@/components/mascot";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-20 text-center">
      <Mascot mood="thinking" className="h-40 w-32" />
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">Not found</h1>
      <p className="mt-2 text-sm text-muted">Velvy looked everywhere. That item or page doesn&apos;t exist, or the address was typed incorrectly.</p>
      <Link href="/inventory" className="mt-6 rounded-full bg-burgundy px-6 py-2.5 text-sm font-semibold text-white">Go to Inventory</Link>
    </div>
  );
}
