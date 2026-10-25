import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { MIGRATIONS } from "./migrations.generated";

/*
 * Businesses (stores) and privacy
 * --------------------------------
 * Every query runs with the current business in the database setting isura.store_id, inside a
 * transaction (so it also works through connection poolers). Row-level security in the database then
 * only shows that business's rows. The business comes from:
 *   1. an explicit withStore(id, ...) block (scheduled jobs, webhooks, sign-in, the ÌṢÚRA admin), or
 *   2. the signed-in person's session cookie (every normal page and API call).
 * With no business (signed out), business data is simply invisible.
 */
export const SESSION_COOKIE = "mystore_session";
export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

const storeCtx = new AsyncLocalStorage<{ storeId: number | null }>();

/** Runs fn with an explicit business (null = none, e.g. sign-in or the ÌṢÚRA admin's overview). */
export function withStore<T>(storeId: number | null, fn: () => Promise<T>): Promise<T> {
  return storeCtx.run({ storeId }, fn);
}

const sessionCache = new Map<string, { storeId: number | null; at: number }>();
/** Forget cached session -> business lookups (after switching business or signing out). */
export function forgetSessionStore(tokenHash?: string) {
  if (tokenHash) sessionCache.delete(tokenHash); else sessionCache.clear();
}

async function sessionStoreId(): Promise<number | null> {
  let token: string | undefined;
  try {
    const { cookies } = await import("next/headers");
    token = (await cookies()).get(SESSION_COOKIE)?.value;
  } catch {
    return null; // not inside a request (scheduled job, script)
  }
  if (!token) return null;
  const h = hashToken(token);
  const hit = sessionCache.get(h);
  if (hit && Date.now() - hit.at < 10_000) return hit.storeId;
  await ready();
  const { rows } = await rawPool().query<{ store_id: number | null }>(
    `SELECT CASE WHEN u.is_platform_admin THEN coalesce(s.active_store_id, u.store_id) ELSE u.store_id END AS store_id
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > now() AND u.is_active AND u.deleted_at IS NULL`,
    [h],
  );
  const storeId = rows[0]?.store_id ?? null;
  if (sessionCache.size > 5000) sessionCache.clear();
  sessionCache.set(h, { storeId, at: Date.now() });
  return storeId;
}

/** The business the current code is working for (null = none). */
export async function currentStoreId(): Promise<number | null> {
  const ctx = storeCtx.getStore();
  if (ctx) return ctx.storeId;
  return sessionStoreId();
}

async function setStore(client: PoolClient, storeId: number | null) {
  // storeId is always an integer we produced ourselves, never user text.
  await client.query(`BEGIN; SELECT set_config('isura.store_id', '${storeId === null ? "" : Math.trunc(storeId)}', true)`);
}

declare global {
  var __mystorePool: Pool | undefined;
  var __mystoreReady: Promise<void> | undefined;
}

function createPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Add it in your hosting provider's environment variables.");
  }
  const local = /localhost|127\.0\.0\.1|@db:|@postgres:/.test(connectionString);
  const pool = new Pool({
    connectionString,
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    ssl: process.env.DATABASE_SSL === "false" || local ? undefined : { rejectUnauthorized: false },
    connectionTimeoutMillis: 15_000,
  });
  // Idle connections can be dropped by serverless databases; don't crash the process.
  pool.on("error", (e) => console.error("[db] idle client error:", e.message));
  return pool;
}

function rawPool(): Pool {
  if (!globalThis.__mystorePool) globalThis.__mystorePool = createPool();
  return globalThis.__mystorePool;
}

/**
 * Creates / updates the database tables on first use. Safe to run from many server instances at
 * once: an advisory lock serialises them, and each migration is applied exactly once.
 */
async function migrate() {
  const client = await rawPool().connect();
  try {
    // One transaction with a transaction-scoped lock: works through connection poolers
    // (Neon / Supabase pooled URLs) and is safe when many instances start at once.
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(727274)");
    await client.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    const { rows } = await client.query<{ name: string }>("SELECT name FROM schema_migrations");
    const done = new Set(rows.map((r) => r.name));
    for (const m of MIGRATIONS) {
      if (done.has(m.name)) continue;
      console.log(`[db] applying ${m.name}`);
      try {
        await client.query(m.sql);
      } catch (e) {
        throw new Error(`Database setup failed in ${m.name}: ${(e as Error).message}`);
      }
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT DO NOTHING", [m.name]);
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

function ready(): Promise<void> {
  if (!globalThis.__mystoreReady) {
    globalThis.__mystoreReady = migrate().catch((e) => {
      globalThis.__mystoreReady = undefined; // retry on the next request
      throw e;
    });
  }
  return globalThis.__mystoreReady;
}

/** Pool that is guaranteed to have an up-to-date schema. */
export async function db(): Promise<Pool> {
  await ready();
  return rawPool();
}

/** @deprecated use db(), kept for call sites that already awaited readiness. */
export function pool(): Pool {
  return rawPool();
}

export async function query<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []) {
  const storeId = await currentStoreId();
  // No business: one plain round trip (business data is invisible anyway).
  if (storeId === null) return (await (await db()).query<T>(text, params)).rows;
  const client = await (await db()).connect();
  try {
    await setStore(client, storeId);
    const res = await client.query<T>(text, params);
    await client.query("COMMIT");
    return res.rows;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []) {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const storeId = await currentStoreId();
  const client = await (await db()).connect();
  try {
    await setStore(client, storeId);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
