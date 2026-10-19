import { z } from "zod";
import { handle, ok, readJson } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { normaliseParams } from "@/lib/reports/engine";
import { generateAndStore } from "@/lib/reports/history";
import { getSettings } from "@/lib/settings";

export const runtime = "nodejs";

const schema = z.object({
  preset: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  month: z.string().optional(),
  kind: z.string().optional(),
  item: z.string().optional().nullable(),
  category: z.union([z.string(), z.number()]).optional().nullable(),
  period_type: z.enum(["week", "month"]).optional().nullable(),
  formats: z.array(z.enum(["pdf", "xlsx", "csv"])).min(1, "Choose at least one format"),
});

/** Manually generate a report and keep it in Report History. */
export const POST = handle(async (req) => {
  const user = await requireApiUser("report.generate");
  const body = schema.parse(await readJson(req));
  const settings = await getSettings();
  const params = normaliseParams(
    { ...body, category: body.category != null ? String(body.category) : null, period_type: body.period_type ?? null, formats: undefined } as Record<string, string | null | undefined>,
    settings.timezone,
  );
  const results = [];
  for (const f of body.formats) {
    const r = await generateAndStore(params, f, { trigger: "manual", userId: user.id, settings });
    results.push({ format: f, ok: r.ok, id: r.id, error: r.ok ? null : r.error });
  }
  if (results.every((r) => !r.ok)) throw new AppError("GENERATION_FAILED", results[0].error ?? "Report generation failed.", 500);
  return ok({ results }, 201);
});
