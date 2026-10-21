import { NextResponse } from "next/server";
import { ZodError } from "zod";

export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
    public extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

const FRIENDLY: Record<string, { status: number; message?: string }> = {
  INSUFFICIENT_STOCK: { status: 409 },
  INVALID_QUANTITY: { status: 400 },
  FRACTION_NOT_ALLOWED: { status: 400 },
  UNIT_NOT_CONVERTIBLE: { status: 400 },
  INVALID_COST: { status: 400 },
  INVALID_DATE: { status: 400 },
  INVALID_REASON: { status: 400 },
  NOTE_REQUIRED: { status: 400 },
  ITEM_ARCHIVED: { status: 409 },
  ITEM_NOT_FOUND: { status: 404, message: "Item not found." },
  TXN_NOT_FOUND: { status: 404, message: "Transaction not found." },
  CANNOT_REVERSE: { status: 409 },
  ALREADY_REVERSED: { status: 409 },
  REASON_REQUIRED: { status: 400 },
  LEDGER_IMMUTABLE: { status: 409 },
  NO_STOCK: { status: 409 },
  NO_CHANGE: { status: 409 },
};

/** Turns DB, validation and app errors into a consistent JSON response. */
export function errorResponse(e: unknown) {
  if (e instanceof AppError) {
    return NextResponse.json({ error: e.message, code: e.code, ...e.extra }, { status: e.status });
  }
  if (e instanceof ZodError) {
    const first = e.issues[0];
    const field = first?.path?.join(".");
    return NextResponse.json(
      { error: first ? `${field ? prettyField(field) + ": " : ""}${first.message}` : "Invalid input", code: "VALIDATION" },
      { status: 400 },
    );
  }
  const err = e as { message?: string; code?: string; detail?: string; constraint?: string };
  const msg = err?.message ?? "";
  const m = msg.match(/^([A-Z_]+):?\s*(.*)$/);
  if (m && FRIENDLY[m[1]]) {
    const def = FRIENDLY[m[1]];
    const body: Record<string, unknown> = { error: def.message ?? capitalise(m[2] || m[1]), code: m[1] };
    if (m[1] === "INSUFFICIENT_STOCK" && err.detail) body.available = err.detail;
    return NextResponse.json(body, { status: def.status });
  }
  if (err?.code === "23505") {
    const what = err.constraint?.includes("sku")
      ? "An item with this code already exists."
      : err.constraint?.includes("email")
        ? "A user with this email already exists."
        : "A record with this name already exists.";
    return NextResponse.json({ error: what, code: "DUPLICATE" }, { status: 409 });
  }
  if (err?.code === "23514" || err?.code === "22003" || err?.code === "22P02") {
    return NextResponse.json({ error: "One of the values is not valid.", code: "INVALID" }, { status: 400 });
  }
  console.error(e);
  return NextResponse.json({ error: "Something went wrong. Please try again.", code: "SERVER_ERROR" }, { status: 500 });
}

function capitalise(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1) + (/[.!?]$/.test(s) ? "" : ".");
}
function prettyField(f: string) {
  return f.replace(/_/g, " ").replace(/([A-Z])/g, " $1").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}
