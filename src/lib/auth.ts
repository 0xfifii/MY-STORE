import "server-only";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, forgetSessionStore, hashToken, query, queryOne } from "./db";
import { AppError } from "./errors";
import { can, type Action, type Role } from "./permissions";

export { SESSION_COOKIE };
const SESSION_DAYS = 14;

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  /** Custom permission list set by the owner (null = role defaults). */
  permissions: string[] | null;
  /** Categories this user may stock in/out (null = all). */
  allowed_category_ids: number[] | null;
  /** The ÌṢÚRA admin: above every business owner, never locked out. */
  is_platform_admin: boolean;
  /** The business this person is working in right now. */
  store_id: number;
  /** Their own business (differs from store_id when the ÌṢÚRA admin is viewing another). */
  home_store_id: number;
  store_name: string;
  store_status: "active" | "paused";
  /** End of the paid period (null = no end date). */
  paid_until: string | null;
  /** Subscription ended or paused: only the renew screen is available. */
  locked: boolean;
};

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 11);
}
export async function verifyPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await query("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)", [
    hashToken(token), userId, expires,
  ]);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && !process.env.APP_URL?.startsWith("http://"),
    path: "/",
    expires,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await query("DELETE FROM sessions WHERE token_hash = $1", [hashToken(token)]);
    forgetSessionStore(hashToken(token));
  }
  jar.delete(SESSION_COOKIE);
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const u = await queryOne<SessionUser>(
    `SELECT u.id, u.name, u.email,
            CASE WHEN u.is_platform_admin THEN 'owner' ELSE u.role END AS role,
            CASE WHEN u.is_platform_admin THEN NULL ELSE u.permissions END AS permissions,
            CASE WHEN u.is_platform_admin THEN NULL ELSE u.allowed_category_ids END AS allowed_category_ids,
            u.is_platform_admin, st.id AS store_id, u.store_id AS home_store_id, st.name AS store_name, st.status AS store_status,
            st.paid_until::text AS paid_until,
            (NOT u.is_platform_admin AND (st.status = 'paused' OR (st.paid_until IS NOT NULL AND st.paid_until < now()))) AS locked
       FROM sessions s JOIN users u ON u.id = s.user_id
       JOIN stores st ON st.id = CASE WHEN u.is_platform_admin THEN coalesce(s.active_store_id, u.store_id) ELSE u.store_id END
      WHERE s.token_hash = $1 AND s.expires_at > now() AND u.is_active AND u.deleted_at IS NULL`,
    [hashToken(token)],
  );
  return u;
}

/** For API routes: throws 401/403 instead of redirecting (402 when the subscription has ended). */
export async function requireApiUser(action: Action = "view", opts: { allowLocked?: boolean } = {}): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new AppError("UNAUTHENTICATED", "Please sign in again.", 401);
  if (user.locked && !opts.allowLocked) {
    throw new AppError("SUBSCRIPTION_ENDED", "This ÌṢÚRA account is paused. Renew the subscription to continue.", 402);
  }
  if (!can(user, action)) {
    throw new AppError("FORBIDDEN", "You don't have permission to do this.", 403);
  }
  return user;
}

/** For pages: redirects to login, to the renew screen when locked, or to dashboard when not permitted. */
export async function requirePageUser(action: Action = "view", opts: { allowLocked?: boolean } = {}): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.locked && !opts.allowLocked) redirect("/billing");
  if (!can(user, action)) redirect("/dashboard?denied=1");
  return user;
}

export async function hasAnyUser() {
  const row = await queryOne<{ n: number }>("SELECT count(*)::int AS n FROM users");
  return (row?.n ?? 0) > 0;
}

/** Simple brute-force protection: 8 failed attempts in 15 minutes locks the email. */
export async function isLoginThrottled(email: string) {
  const row = await queryOne<{ n: number }>(
    `SELECT count(*)::int AS n FROM login_attempts
      WHERE lower(email) = lower($1) AND NOT success AND attempted_at > now() - interval '15 minutes'`,
    [email],
  );
  return (row?.n ?? 0) >= 8;
}

export async function recordLoginAttempt(email: string, success: boolean) {
  await query("INSERT INTO login_attempts (email, success) VALUES ($1, $2)", [email, success]);
}

/** Only the ÌṢÚRA admin. */
export async function requirePlatformAdmin(kind: "api" | "page" = "api"): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    if (kind === "page") redirect("/login");
    throw new AppError("UNAUTHENTICATED", "Please sign in again.", 401);
  }
  if (!user.is_platform_admin) {
    if (kind === "page") redirect("/dashboard?denied=1");
    throw new AppError("FORBIDDEN", "Only the ÌṢÚRA admin can do this.", 403);
  }
  return user;
}
