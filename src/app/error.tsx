"use client";

export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div style={{ fontFamily: "system-ui, sans-serif", padding: 24, maxWidth: 560, margin: "40px auto" }}>
      <h1 className="font-display text-2xl font-bold text-burgundy">MY STORE can&apos;t load right now</h1>
      <p className="mt-2 text-sm">This is usually the database connection. Your saved records are safe.</p>
      <p className="mt-2 text-sm">
        Open <a className="font-semibold text-burgundy underline" href="/api/health">/api/health</a> on this site — it says exactly what is wrong.
      </p>
      {error.digest && <p className="mt-2 text-xs text-muted">Error reference: {error.digest}</p>}
      <button onClick={reset} className="mt-4 rounded-2xl bg-burgundy px-4 py-2 text-sm font-semibold text-white">Try again</button>
    </div>
  );
}
