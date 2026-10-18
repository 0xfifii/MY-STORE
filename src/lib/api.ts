import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { errorResponse } from "./errors";

type Handler<C> = (req: NextRequest, ctx: C) => Promise<Response>;

/** Wraps a route handler so every error becomes a clean JSON response. */
export function handle<C>(fn: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      return await fn(req, ctx);
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export async function readJson(req: NextRequest): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? body : {};
  } catch {
    return {};
  }
}

export const ok = (data: unknown = { ok: true }, status = 200) => NextResponse.json(data, { status });
