import { handle } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { loadReceipt, receiptFileName, receiptPdf } from "@/lib/receipt";

type Ctx = { params: Promise<{ id: string }> };

/** Printable PDF receipt for one stock movement. ?inline=1 opens it in the browser instead of downloading. */
export const GET = handle<Ctx>(async (req, { params }) => {
  await requireApiUser("view");
  const { t, s } = await loadReceipt((await params).id);
  const pdf = await receiptPdf(t, s);
  const inline = req.nextUrl.searchParams.get("inline") === "1";
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${receiptFileName(t)}"`,
      "Cache-Control": "no-store",
    },
  });
});
