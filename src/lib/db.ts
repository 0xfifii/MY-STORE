import "server-only";
import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { MIGRATIONS } from "./migrations.generated";

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
  const res = await (await db()).query<T>(text, params);
  return res.rows;
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []) {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await (await db()).connect();
  try {
    await client.query("BEGIN");
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
