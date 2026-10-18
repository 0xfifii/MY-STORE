import type { NextConfig } from "next";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Report generation (pdfmake/pdfkit, exceljs) loads some files dynamically, which Next's
 * file tracing can miss in standalone/serverless builds. Ship their full dependency trees.
 */
function dependencyGlobs(roots: string[]): string[] {
  const seen = new Set<string>();
  const visit = (name: string, base: string) => {
    const dirs = [join(base, "node_modules", name), join(process.cwd(), "node_modules", name)];
    const dir = dirs.find((d) => existsSync(join(d, "package.json")));
    if (!dir || seen.has(dir)) return;
    seen.add(dir);
    const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    for (const dep of Object.keys({ ...pkg.dependencies, ...pkg.optionalDependencies })) visit(dep, dir);
  };
  roots.forEach((r) => visit(r, process.cwd()));
  return [...seen].map((d) => "./" + d.slice(process.cwd().length + 1) + "/**");
}

const reportFiles = ["./assets/fonts/**", ...dependencyGlobs(["pdfmake", "exceljs"])];

const nextConfig: NextConfig = {
  output: "standalone",
  // pdfmake/pdfkit read font metric files from disk at runtime; keep them unbundled.
  serverExternalPackages: ["pdfmake", "pdfkit", "exceljs"],
  outputFileTracingIncludes: {
    "/api/reports/**": reportFiles,
    "/api/cron/**": reportFiles,
  },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
