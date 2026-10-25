import { NextResponse, type NextRequest } from "next/server";
import { confirmPayment } from "@/lib/businesses";

/** Paystack sends the payer back here after paying; we confirm with Paystack before unlocking. */
export async function GET(req: NextRequest) {
  const reference = req.nextUrl.searchParams.get("reference") ?? req.nextUrl.searchParams.get("trxref") ?? "";
  const back = new URL("/billing", req.url);
  if (!reference) { back.searchParams.set("error", "No payment reference came back from Paystack."); return NextResponse.redirect(back, 303); }
  try {
    const r = await confirmPayment(reference);
    if (r.ok) return NextResponse.redirect(new URL("/dashboard?renewed=1", req.url), 303);
    back.searchParams.set("error", r.reason);
  } catch (e) {
    back.searchParams.set("error", (e as Error).message);
  }
  return NextResponse.redirect(back, 303);
}
