import { z } from "zod";
import { handle, ok, readJson } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { emailHtml, sendMail } from "@/lib/mailer";
import { loadReceipt, receiptFileName, receiptPdf, receiptTitle } from "@/lib/receipt";
import { formatMoney, formatQty } from "@/lib/format";
import { emailListSchema } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle<Ctx>(async (req, { params }) => {
  const user = await requireApiUser("mail.send");
  const body = z.object({ to: emailListSchema, message: z.string().trim().max(2000).optional() }).parse(await readJson(req));
  const { t, s } = await loadReceipt((await params).id);
  const pdf = await receiptPdf(t, s);
  const title = `${receiptTitle(t)} ${t.txn_no}`;
  const text = [
    body.message,
    `${receiptTitle(t)} from ${s.store_name}`,
    `Item: ${t.item_name}\nQuantity: ${formatQty(t.entered_quantity)} ${t.entered_unit_symbol}\nValue: ${formatMoney(t.total_value, s.currency_symbol)}` +
      (t.worker_name ? `\nTaken by: ${t.worker_name}` : ""),
    "The receipt is attached as a PDF.",
  ].filter(Boolean).join("\n\n");
  try {
    await sendMail({
      to: body.to, subject: `${s.store_name}: ${title}`, text, html: emailHtml(s.store_name, title, text),
      attachments: [{ filename: receiptFileName(t), content: pdf, contentType: "application/pdf" }],
      kind: "receipt", userId: user.id, replyTo: user.email, payload: { attach: { kind: "receipt", txnId: t.id } },
    });
  } catch (e) {
    throw new AppError("EMAIL_FAILED", (e as Error).message, 502);
  }
  return ok({ sent: body.to });
});
