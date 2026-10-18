import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <h1 className="font-display text-3xl font-bold">Not found</h1>
      <p className="mt-2 text-sm text-muted">That item or page doesn&apos;t exist. It may have been typed incorrectly.</p>
      <Link href="/inventory" className="mt-6 inline-block font-semibold text-burgundy hover:underline">Go to Inventory</Link>
    </div>
  );
}
