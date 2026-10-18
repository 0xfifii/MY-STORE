import { NextResponse } from "next/server";
import { queryOne } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await queryOne("SELECT 1");
    return NextResponse.json({ ok: true, database: "up" });
  } catch {
    return NextResponse.json({ ok: false, database: "down" }, { status: 503 });
  }
}
