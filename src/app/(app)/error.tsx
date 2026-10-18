"use client";

import { Button } from "@/components/ui/primitives";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="font-display text-2xl font-bold">This page couldn&apos;t load</h1>
      <p className="mt-2 text-sm text-muted">
        The server or database didn&apos;t respond. Your saved records are safe. Check the connection and try again.
      </p>
      {error.digest && <p className="mt-2 text-xs text-muted">Error reference: {error.digest}</p>}
      <Button className="mt-6" onClick={reset}>Try again</Button>
    </div>
  );
}
