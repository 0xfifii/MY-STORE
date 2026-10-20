import { NextResponse } from "next/server";
import { queryOne } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Health check. On failure it says which part is wrong (never prints secrets). */
export async function GET() {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ ok: false, problem: "DATABASE_URL is not set in the hosting environment variables." }, { status: 503 });
  }
  // Show only the host name (never the password) so a bad copy-paste is easy to spot.
  const raw = process.env.DATABASE_URL.trim();
  let host = "(could not read)";
  try {
    host = new URL(raw).hostname || host;
  } catch {
    /* not a URL */
  }
  if (!/^postgres(ql)?:\/\//.test(raw)) {
    return NextResponse.json({
      ok: false,
      problem: "DATABASE_URL must start with postgresql://. Remove anything before it (such as psql or quote marks).",
      starts_with: raw.slice(0, 12),
    }, { status: 503 });
  }
  try {
    await queryOne("SELECT 1 FROM settings LIMIT 1");
    return NextResponse.json({ ok: true, database: "up" });
  } catch (e) {
    const msg = (e as Error).message ?? "";
    const problem = /password authentication|authentication failed/i.test(msg)
      ? "Database password in DATABASE_URL is wrong."
      : /ENOTFOUND|getaddrinfo|ECONNREFUSED|timeout/i.test(msg)
        ? "Can't reach the database host in DATABASE_URL. Check the address was copied fully."
        : msg.replace(/postgres(ql)?:\/\/[^\s]+/g, "[database url]").slice(0, 300);
    const code = (e as { code?: string }).code ?? null;
    return NextResponse.json({ ok: false, problem, database_host: host, error_code: code }, { status: 503 });
  }
}
