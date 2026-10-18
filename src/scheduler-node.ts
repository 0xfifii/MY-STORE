import { runScheduledReports } from "./lib/reports/history";

/** Node-only part of the built-in scheduler (see instrumentation.ts). */
export function startScheduler() {
  if (process.env.DISABLE_INTERNAL_SCHEDULER === "true" || !process.env.DATABASE_URL) return;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const r = await runScheduledReports();
      if (r.status === "ran" && r.generated.length) console.log(`[scheduler] generated ${r.generated.join(", ")}`);
    } catch (e) {
      console.error("[scheduler] report run failed:", (e as Error).message);
    } finally {
      running = false;
    }
  };
  setTimeout(tick, 20_000); // shortly after start-up: catches up on anything missed while asleep
  setInterval(tick, 5 * 60_000);
}
