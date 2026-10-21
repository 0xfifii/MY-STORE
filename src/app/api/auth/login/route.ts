import { z } from "zod";
import { NextResponse, type NextRequest } from "next/server";
import { handle, ok, readJson } from "@/lib/api";
import { createSession, isLoginThrottled, recordLoginAttempt, verifyPassword } from "@/lib/auth";
import { queryOne, query } from "@/lib/db";
import { AppError } from "@/lib/errors";

const schema = z.object({ email: z.string().trim().toLowerCase().min(1, "Enter your email"), password: z.string().min(1, "Enter your password") });

/**
 * JSON sign-in (used by the page once it has loaded). If the person presses Enter before the page's
 * script is ready, the browser posts the form itself; that case is handled too and redirects back,
 * so nothing typed is lost to a page reload.
 */
export async function POST(req: NextRequest) {
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("application/x-www-form-urlencoded") || type.includes("multipart/form-data")) {
    const f = await req.formData();
    const email = String(f.get("email") ?? "");
    const next = String(f.get("next") ?? "/dashboard");
    const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
    const res = await jsonLogin(new Request(req.url, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: String(f.get("password") ?? "") }),
    }) as NextRequest, undefined as never);
    if (res.ok) {
      const r = NextResponse.redirect(new URL(safeNext, req.url), 303);
      for (const c of res.headers.getSetCookie()) r.headers.append("set-cookie", c);
      return r;
    }
    const data = await res.json().catch(() => ({}));
    const back = new URL("/login", req.url);
    back.searchParams.set("error", data.error ?? "Couldn't sign in. Try again.");
    back.searchParams.set("email", email);
    if (safeNext !== "/dashboard") back.searchParams.set("next", safeNext);
    return NextResponse.redirect(back, 303);
  }
  return jsonLogin(req, undefined as never);
}

const jsonLogin = handle(async (req) => {
  const { email, password } = schema.parse(await readJson(req));
  if (await isLoginThrottled(email)) {
    throw new AppError("THROTTLED", "Too many failed attempts. Wait 15 minutes and try again.", 429);
  }
  const user = await queryOne<{ id: string; password_hash: string; is_active: boolean }>(
    "SELECT id, password_hash, is_active FROM users WHERE lower(email) = $1 AND deleted_at IS NULL",
    [email],
  );
  const valid = user ? await verifyPassword(password, user.password_hash) : false;
  await recordLoginAttempt(email, valid && !!user?.is_active);
  if (!user || !valid) throw new AppError("BAD_LOGIN", "Incorrect email or password.", 401);
  if (!user.is_active) throw new AppError("INACTIVE", "This account has been deactivated. Contact the store owner.", 403);
  await createSession(user.id);
  await query("UPDATE users SET last_login_at = now() WHERE id = $1", [user.id]);
  return ok();
});
