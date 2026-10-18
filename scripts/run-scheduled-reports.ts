/**
 * Triggers the daily-report job on a running MY STORE server.
 * Use this from system cron / Task Scheduler on a self-hosted server, e.g. every 15 minutes:
 *   * /15 * * * *  cd /opt/mystore && npm run reports:run
 * Needs APP_URL and CRON_SECRET (read from the environment or .env / .env.local).
 */
import { loadEnv } from "./load-env";

loadEnv();

async function main() {
  const url = process.env.APP_URL;
  const secret = process.env.CRON_SECRET;
  if (!url || !secret) throw new Error("APP_URL and CRON_SECRET must be set.");
  const res = await fetch(`${url.replace(/\/$/, "")}/api/cron/daily-report`, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}` },
  });
  const body = await res.text();
  console.log(`${new Date().toISOString()} ${res.status} ${body}`);
  if (!res.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
