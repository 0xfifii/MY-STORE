"use client";

import { Mascot } from "@/components/mascot";

export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-16 text-center">
      <Mascot mood="worried" className="h-40 w-32" />
      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-burgundy">ÌṢÚRA can&apos;t load right now</h1>
      <p className="mt-2 text-sm text-muted">This is usually the database connection. Your saved records are safe.</p>
      <p className="mt-2 text-sm text-muted">
        Open <a className="font-semibold text-burgundy underline" href="/api/health">/api/health</a> on this site to see exactly what is wrong.
      </p>
      {error.digest && <p className="mt-2 text-xs text-muted">Error reference: {error.digest}</p>}
      <button onClick={reset} className="mt-5 rounded-full bg-burgundy px-6 py-2.5 text-sm font-semibold text-white transition active:scale-95">Try again</button>
    </div>
  );
}
