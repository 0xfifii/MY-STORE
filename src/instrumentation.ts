/**
 * Built-in report scheduler. While the server is running it checks every 5 minutes whether a
 * daily / weekly / monthly report is due and generates it (once per period, duplicates are
 * prevented in the database). If the server was asleep (e.g. free hosting), the next start
 * catches up on anything missed. Calling /api/cron/daily-report from an external scheduler is
 * optional; set DISABLE_INTERNAL_SCHEDULER=true to turn this one off.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startScheduler } = await import("./scheduler-node");
    startScheduler();
  }
}
