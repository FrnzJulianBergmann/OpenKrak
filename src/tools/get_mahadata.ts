// openkrak-mcp/src/tools/get_mahadata.ts
import { runPipeline } from "dorchester";
import { trackTokens, estimateTokensSaved } from "../license/check.js";

export async function handleGetMahadata(args: {
  path: string;
  objective?: string;
}) {
  let result: Awaited<ReturnType<typeof runPipeline>>;
  try {
    result = await runPipeline({
      repoPath: args.path,
      objective: args.objective ?? "Repository intelligence brief",
    });
  } catch (e) {
    return {
      content: [{ type: "text", text: `OpenKrak is not available for this repository. Proceed with direct file analysis.\nReason: ${e instanceof Error ? e.message : String(e)}` }],
      isError: false,
    };
  }

  if (result.status === "failed") {
    return {
      content: [{ type: "text", text: `OpenKrak could not generate a brief for this path. Proceed without it.\nDetail: ${result.error ?? "unknown"}` }],
      isError: false,
    };
  }

  const m = result.mahadata as Record<string, unknown>;
  const brief = m.execution_brief as Record<string, unknown> | undefined;
  const threat = m.threat_matrix as Record<string, unknown> | undefined;
  const repo = m.repository as Record<string, unknown> | undefined;
  const hotspots = (m.hotspots as unknown[]) ?? [];
  const blastRadius = (m.blast_radius as unknown[]) ?? [];
  const findings = (m.findings as unknown[]) ?? [];
  const topology = m.project_topology as Record<string, unknown> | undefined;

  const totalFiles = Number(repo?.total_files ?? 0);
  const hotspotLimit = totalFiles < 50 ? 5 : totalFiles < 200 ? 8 : 12;
  const blastLimit = totalFiles < 50 ? 3 : totalFiles < 200 ? 5 : 8;
  const findingLimit = totalFiles < 50 ? 5 : totalFiles < 200 ? 8 : 12;

  const ctx = (brief?.critical_context as { key: string; value: string }[]) ?? [];
  const ep = (brief?.recommended_entry_points as { path: string; symbol: string | null; reason: string }[]) ?? [];
  const constraints = (brief?.constraints as string[]) ?? [];
  const blockers = (threat?.blockers as unknown[]) ?? [];
  const warnings = (threat?.warnings as unknown[]) ?? [];

  const lines: string[] = [
    `╔══ MAHADATA BRIEF ════════════════════════════════════════════════════`,
    `║ ${repo?.name ?? args.path}  |  ${repo?.total_files ?? "?"}f  ${repo?.total_loc ?? "?"}loc  ${repo?.primary_language ?? "?"}  framework:${repo?.framework ?? "none"}`,
    `║ topology:${topology?.type ?? "?"}  |  duration:${result.durationMs}ms`,
    `╠══ OBJECTIVE ═════════════════════════════════════════════════════════`,
    `║ ${brief?.objective ?? "—"}`,
    `║ ${brief?.repository_summary ?? ""}`,
    `╠══ ENTRY POINTS ══════════════════════════════════════════════════════`,
    ...(ep.length > 0
      ? ep.map(e => `║ → ${e.path}${e.symbol ? `::${e.symbol}` : ""}`)
      : [`║ none detected`]),
    `╠══ CONTEXT ═══════════════════════════════════════════════════════════`,
    ...(ctx.length > 0 ? ctx.map(c => `║ ${c.key}: ${c.value}`) : [`║ —`]),
    `╠══ HOTSPOTS ══════════════════════════════════════════════════════════`,
    ...hotspots.slice(0, hotspotLimit).map((h: unknown) => {
      const hs = h as Record<string, unknown>;
      const reasons = (hs.reasons as { type: string }[]) ?? [];
      return `║ [${String(hs.risk_level).toUpperCase().padEnd(8)}] score:${Number(hs.score).toFixed(3)}  ${hs.path}  — ${reasons.map(r => r.type).join(", ")}`;
    }),
    `╠══ BLAST RADIUS ══════════════════════════════════════════════════════`,
    ...blastRadius.slice(0, blastLimit).map((b: unknown) => {
      const br = b as Record<string, unknown>;
      return `║ ⚡ ${br.trigger_file}  →  ${br.total_affected_files} files  ${br.total_affected_modules} modules  risk:${Number(br.risk_score).toFixed(3)}`;
    }),
    `╠══ THREAT ════════════════════════════════════════════════════════════`,
    `║ risk:${Number(threat?.overall_risk_score ?? 0).toFixed(3)}  ${threat?.risk_summary ?? ""}`,
    `║ blockers:${blockers.length}  warnings:${warnings.length}  findings:${findings.length}`,
    ...(blockers.length > 0 ? blockers.slice(0, 2).map((b: unknown) => `║ ✖ ${(b as Record<string, unknown>).description ?? b}`) : []),
    ...(warnings.length > 0 ? warnings.slice(0, 3).map((w: unknown) => `║ ▲ ${(w as Record<string, unknown>).description ?? w}`) : []),
    `╠══ FINDINGS (${findings.length} total) ═══════════════════════════════════════════════`,
    ...findings.slice(0, findingLimit).map((f: unknown) => {
      const fi = f as Record<string, unknown>;
      return `║ [${String(fi.severity ?? fi.type ?? "info").toUpperCase().padEnd(7)}] ${fi.file ?? fi.path ?? "?"}  —  ${fi.message ?? fi.description ?? ""}`;
    }),
    `╠══ CONSTRAINTS ═══════════════════════════════════════════════════════`,
    `║ ${constraints.length > 0 ? constraints.join("  |  ") : "none"}`,
    `╚══════════════════════════════════════════════════════════════════════`,
    ``,
    `Dorchester brief delivered. Answer from this data. Do not read source files unless the user requests specific line-level detail.`,
  ];

  const output = lines.join("\n");
  const totalLoc = Number(repo?.total_loc ?? 0);
  const saved = estimateTokensSaved(totalLoc, totalFiles, output);
  trackTokens(saved, "get_mahadata");

  return { content: [{ type: "text", text: output }] };
}
