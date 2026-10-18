/**
 * Applies SQL files in db/migrations in order, each inside a transaction, and records
 * them in schema_migrations so each runs once. Plain Node (no build step needed).
 *   DATABASE_URL=postgres://... node scripts/migrate.mjs
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Minimal .env loader (Next.js loads these itself; this is for the CLI).
for (const file of [".env.local", ".env"]) {
  const p = join(root, file);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
const local = /localhost|127\.0\.0\.1|@db:|@postgres:/.test(url);
const client = new pg.Client({
  connectionString: url,
  ssl: process.env.DATABASE_SSL === "false" || local ? undefined : { rejectUnauthorized: false },
});

try {
  await client.connect();
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  const dir = join(root, "db", "migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const { rows } = await client.query("SELECT name FROM schema_migrations");
  const done = new Set(rows.map((r) => r.name));
  for (const file of files) {
    if (done.has(file)) continue;
    console.log(`Applying ${file} ...`);
    await client.query("BEGIN");
    try {
      await client.query(readFileSync(join(dir, file), "utf8"));
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT DO NOTHING", [file]);
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw new Error(`Migration ${file} failed: ${e.message}`);
    }
  }
  console.log("Database is up to date.");
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
