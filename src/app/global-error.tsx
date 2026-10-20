"use client";

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: 24, maxWidth: 560, margin: "40px auto", color: "#2b1613" }}>
        <h1 style={{ color: "#8f0e16" }}>The Velvet Store can&apos;t start</h1>
        <p>The app couldn&apos;t load. This is usually the database connection.</p>
        <p>
          Open <a href="/api/health">/api/health</a> on this site. It says exactly what is wrong (for example a missing or
          mistyped DATABASE_URL).
        </p>
        {error.digest && <p style={{ color: "#76625c", fontSize: 13 }}>Error reference: {error.digest}</p>}
      </body>
    </html>
  );
}
