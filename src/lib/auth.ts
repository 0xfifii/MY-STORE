import "server-only";
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { query, queryOne } from "./db";
import { AppError } from "./errors";
import { can, type Action, type Role } from "./permissions";

export const SESSION_COOKIE = "mystore_session";
const SESSION_DAYS = 14;

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
};

const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

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
  if (token) await query("DELETE FROM sessions WHERE token_hash = $1", [hashToken(token)]);
  jar.delete(SESSION_COOKIE);
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return queryOne<SessionUser>(
    `SELECT u.id, u.name, u.email, u.role
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > now() AND u.is_active`,
    [hashToken(token)],
  );
}

/** For API routes: throws 401/403 instead of redirecting. */
export async function requireApiUser(action: Action = "view"): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new AppError("UNAUTHENTICATED", "Please sign in again.", 401);
  if (!can(user.role, action)) {
    throw new AppError("FORBIDDEN", "You don't have permission to do this.", 403);
  }
  return user;
}

/** For pages: redirects to login, or to dashboard when not permitted. */
export async function requirePageUser(action: Action = "view"): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!can(user.role, action)) redirect("/dashboard?denied=1");
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
