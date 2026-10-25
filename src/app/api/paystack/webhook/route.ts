import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { confirmPayment, paystackKey } from "@/lib/businesses";

export const runtime = "nodejs";

/**
 * Paystack's server-to-server notice (Settings > API Keys & Webhooks > Webhook URL = <app>/api/paystack/webhook).
 * Signed with the secret key; we still re-check the payment with Paystack before applying it.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const key = await paystackKey();
  const sig = req.headers.get("x-paystack-signature") ?? "";
  if (!key) return NextResponse.json({ error: "not configured" }, { status: 503 });
  const expected = createHmac("sha512", key).update(raw).digest("hex");
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return NextResponse.json({ error: "bad signature" }, { status: 401 });
  const event = JSON.parse(raw || "{}") as { event?: string; data?: { reference?: string } };
  if (event.event === "charge.success" && event.data?.reference) {
    try { await confirmPayment(event.data.reference); } catch (e) { console.error("[paystack] webhook:", (e as Error).message); }
  }
  return NextResponse.json({ ok: true });
}
