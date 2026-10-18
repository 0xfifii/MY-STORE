import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { runScheduledReports } from "@/lib/reports/history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorised(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  const header = req.headers.get("authorization") ?? "";
  const given = header.startsWith("Bearer ") ? header.slice(7) : req.nextUrl.searchParams.get("secret") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Called by an external scheduler (Vercel Cron, GitHub Actions, system cron, Supabase pg_cron…).
 * It is safe to call as often as you like: the report is only generated once the configured
 * local time has passed, and only once per day per format.
 */
async function run(req: NextRequest) {
  if (!authorised(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await runScheduledReports();
    return NextResponse.json(result);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
