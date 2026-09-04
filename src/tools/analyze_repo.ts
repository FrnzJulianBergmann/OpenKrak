// openkrak-mcp/src/tools/analyze_repo.ts
import { runPipeline } from "dorchester";
import { trackTokens, estimateTokensSaved } from "../license/check.js";

export async function handleAnalyzeRepo(args: {
  path: string;
  objective?: string;
}) {
  let result: Awaited<ReturnType<typeof runPipeline>>;
  try {
    result = await runPipeline({
      repoPath: args.path,
      objective: args.objective ?? "Full repository analysis",
    });
  } catch (e) {
    return {
      content: [{ type: "text", text: `OpenKrak is not available for this repository. Proceed with direct file analysis.\nReason: ${e instanceof Error ? e.message : String(e)}` }],
      isError: false,
    };
  }

  if (result.status === "failed") {
    return {
      content: [{ type: "text", text: `OpenKrak could not complete analysis for this path. Proceed without it.\nDetail: ${result.error ?? "unknown"}` }],
      isError: false,
    };
  }

  const m = result.mahadata as Record<string, unknown>;
  const meta = m.meta as Record<string, unknown> | undefined;
  const repo = m.repository as Record<string, unknown> | undefined;
  const hotspots = (m.hotspots as unknown[]) ?? [];
  const blastRadius = (m.blast_radius as unknown[]) ?? [];
  const findings = (m.findings as unknown[]) ?? [];
  const brief = m.execution_brief as Record<string, unknown> | undefined;
  const threat = m.threat_matrix as Record<string, unknown> | undefined;
  const topology = m.project_topology as Record<string, unknown> | undefined;

  const totalFiles = Number(repo?.total_files ?? 0);
  const hotspotLimit = totalFiles < 50 ? 5 : totalFiles < 200 ? 8 : 12;

  const ep = (brief?.recommended_entry_points as { path: string; symbol: string | null; reason: string }[]) ?? [];
  const ctx = (brief?.critical_context as { key: string; value: string }[]) ?? [];
  const constraints = (brief?.constraints as string[]) ?? [];
  const blockers = (threat?.blockers as unknown[]) ?? [];
  const warnings = (threat?.warnings as unknown[]) ?? [];

  const lines: string[] = [
    `╔══ DORCHESTER SCAN COMPLETE ══════════════════════════════════════════`,
    `║ Repo     : ${repo?.name ?? args.path}`,
    `║ Scan ID  : ${(meta?.scan_id as string ?? "?").slice(0, 8)}  |  Duration: ${result.durationMs}ms`,
    `║ Stats    : ${repo?.total_files ?? "?"} files  |  ${repo?.total_loc ?? "?"} LOC  |  ${repo?.primary_language ?? "?"}  |  framework: ${repo?.framework ?? "none"}`,
    `║ Topology : ${topology?.type ?? "?"} — modules: ${(topology?.modules as unknown[] ?? []).length}`,
    `╠══ OBJECTIVE ═════════════════════════════════════════════════════════`,
    `║ ${brief?.objective ?? args.objective ?? "—"}`,
    `║ ${brief?.repository_summary ?? ""}`,
    `╠══ ENTRY POINTS ══════════════════════════════════════════════════════`,
    ...(ep.length > 0
      ? ep.map(e => `║ → ${e.path}${e.symbol ? `::${e.symbol}` : ""}  [${e.reason}]`)
      : [`║ → none detected`]),
    `╠══ CRITICAL CONTEXT ══════════════════════════════════════════════════`,
    ...(ctx.length > 0
      ? ctx.map(c => `║ ${c.key}: ${c.value}`)
      : [`║ —`]),
    `╠══ HOTSPOT REGISTRY (${hotspots.length} files ranked) ════════════════════════════`,
    ...hotspots.slice(0, hotspotLimit).map((h: unknown, i: number) => {
      const hs = h as Record<string, unknown>;
      const reasons = (hs.reasons as { type: string }[]) ?? [];
      const bar = "█".repeat(Math.round(Number(hs.score) * 10));
      return `║ ${String(i + 1).padStart(2)}. [${String(hs.risk_level).toUpperCase().padEnd(8)}] ${hs.path}\n║     score:${Number(hs.score).toFixed(3)} ${bar}  changes:${hs.change_frequency}  flags:${reasons.map(r => r.type).join(", ")}`;
    }),
    `╠══ BLAST RADIUS (top ${Math.min(5, blastRadius.length)}) ══════════════════════════════════════`,
    ...blastRadius.slice(0, 5).map((b: unknown) => {
      const br = b as Record<string, unknown>;
      return `║ ⚡ ${br.trigger_file}\n║     → ${br.total_affected_files} files  |  ${br.total_affected_modules} modules  |  risk:${Number(br.risk_score).toFixed(3)}`;
    }),
    `╠══ THREAT MATRIX ═════════════════════════════════════════════════════`,
    `║ Overall Risk : ${Number(threat?.overall_risk_score ?? 0).toFixed(3)}  |  ${threat?.risk_summary ?? ""}`,
    `║ Blockers     : ${blockers.length > 0 ? blockers.slice(0, 3).map((b: unknown) => (b as Record<string, unknown>).description ?? b).join(" | ") : "none"}`,
    `║ Warnings     : ${warnings.length} total${warnings.length > 0 ? " — " + warnings.slice(0, 3).map((w: unknown) => (w as Record<string, unknown>).description ?? w).join(" | ") : ""}`,
    `║ Findings     : ${findings.length} total`,
    `╠══ CONSTRAINTS ═══════════════════════════════════════════════════════`,
    `║ ${constraints.length > 0 ? constraints.join("  |  ") : "none"}`,
    `╚══════════════════════════════════════════════════════════════════════`,
    ``,
    `Dorchester has pre-mapped this repository. Proceed with full context. Do not read source files unless specific line-level detail is required.`,
  ];

  const output = lines.join("\n");
  const totalLoc = Number(repo?.total_loc ?? 0);
  const saved = estimateTokensSaved(totalLoc, totalFiles, output);
  trackTokens(saved, "analyze_repo");

  return { content: [{ type: "text", text: output }] };
}
