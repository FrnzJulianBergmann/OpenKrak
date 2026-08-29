// openkrak-mcp/src/tools/get_mahadata.ts
import { runPipeline } from "dorchester";
import { trackTokens, estimateTokensSaved } from "../license/check.js";

export async function handleGetMahadata(args: {
  path: string;
  objective?: string;
}) {
  const result = await runPipeline({
    repoPath: args.path,
    objective: args.objective ?? "Analyze repository",
  });

  if (result.status === "failed") {
    return {
      content: [{ type: "text", text: `OpenKrak error: ${result.error}` }],
      isError: true,
    };
  }

  const m = result.mahadata as Record<string, unknown>;
  const brief = m.execution_brief as Record<string, unknown> | undefined;
  const threat = m.threat_matrix as Record<string, unknown> | undefined;
  const repo = m.repository as Record<string, unknown> | undefined;
  const hotspots = (m.hotspots as unknown[]) ?? [];
  const blastRadius = (m.blast_radius as unknown[]) ?? [];
  const findings = (m.findings as unknown[]) ?? [];

  if (!brief) {
    return {
      content: [{ type: "text", text: "OpenKrak: no execution_brief generated." }],
      isError: true,
    };
  }

  const totalFiles = Number(repo?.total_files ?? 0);
  const hotspotLimit = totalFiles < 50 ? 3 : totalFiles < 200 ? 5 : totalFiles < 500 ? 8 : 12;
  const blastLimit = totalFiles < 50 ? 3 : totalFiles < 200 ? 5 : 8;
  const findingLimit = totalFiles < 50 ? 3 : totalFiles < 200 ? 5 : 10;

  const ctx = (brief.critical_context as { key: string; value: string }[]) ?? [];
  const ep = (brief.recommended_entry_points as { path: string; symbol: string | null; reason: string }[]) ?? [];
  const constraints = (brief.constraints as string[]) ?? [];
  const blockers = ((threat?.blockers as unknown[]) ?? []);
  const warnings = ((threat?.warnings as unknown[]) ?? []);

  const lines: string[] = [
    `[MAHADATA] repo:${repo?.name ?? args.path}`,
    `lang:${repo?.primary_language ?? "?"} | files:${repo?.total_files ?? "?"} | loc:${repo?.total_loc ?? "?"} | framework:${repo?.framework ?? "none"}`,
    `objective: ${brief.objective}`,
    `summary: ${brief.repository_summary}`,
    ``,
    `CONTEXT:`,
    ...ctx.map((c) => `  ${c.key}: ${c.value}`),
    ``,
    `HOTSPOTS (${hotspots.length} total, top ${Math.min(hotspotLimit, hotspots.length)}):`,
    ...hotspots.slice(0, hotspotLimit).map((h: unknown) => {
      const hs = h as Record<string, unknown>;
      const reasons = (hs.reasons as { type: string }[]) ?? [];
      return `  [${hs.risk_level}] ${hs.path} score:${Number(hs.score).toFixed(2)} changes:${hs.change_frequency} — ${reasons.map(r => r.type).join(", ")}`;
    }),
    ``,
    `BLAST RADIUS (top ${Math.min(blastLimit, blastRadius.length)}):`,
    ...blastRadius.slice(0, blastLimit).map((b: unknown) => {
      const br = b as Record<string, unknown>;
      return `  ${br.trigger_file} → affects ${br.total_affected_files} files, ${br.total_affected_modules} modules (risk:${Number(br.risk_score).toFixed(2)})`;
    }),
    ``,
    `ENTRY POINTS:`,
    ...ep.map((e) => `  ${e.path}${e.symbol ? `::${e.symbol}` : ""} — ${e.reason}`),
    ``,
    `CONSTRAINTS: ${constraints.join(" | ")}`,
    ``,
    `THREAT: overall_risk=${Number(threat?.overall_risk_score ?? 0).toFixed(2)} | ${threat?.risk_summary ?? ""}`,
    blockers.length > 0 ? `BLOCKERS (${blockers.length}): ${blockers.slice(0, 3).map((b: unknown) => (b as Record<string, unknown>).description ?? b).join(" | ")}` : `BLOCKERS: none`,
    warnings.length > 0 ? `WARNINGS (${warnings.length}): ${warnings.slice(0, 5).map((w: unknown) => (w as Record<string, unknown>).description ?? w).join(" | ")}` : `WARNINGS: none`,
    ``,
    findings.length > 0 ? `FINDINGS (${findings.length} total, top ${Math.min(findingLimit, findings.length)}):` : null,
    ...findings.slice(0, findingLimit).map((f: unknown) => {
      const fi = f as Record<string, unknown>;
      return `  [${fi.severity ?? fi.type}] ${fi.file ?? fi.path} — ${fi.message ?? fi.description ?? ""}`;
    }),
  ].filter((l): l is string => l !== null);

  const output = lines.join("\n");

  // Track tokens saved
  const totalLoc = Number(repo?.total_loc ?? 0);
  const saved = estimateTokensSaved(totalLoc, totalFiles, output);
  trackTokens(saved, "get_mahadata");

  return { content: [{ type: "text", text: output }] };
}
