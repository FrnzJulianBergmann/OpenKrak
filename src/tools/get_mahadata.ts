// openkrak-mcp/src/tools/get_mahadata.ts
import { runPipeline } from "dorchester";

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

  if (!brief) {
    return {
      content: [{ type: "text", text: "OpenKrak: no execution_brief generated." }],
      isError: true,
    };
  }

  const ctx = (brief.critical_context as { key: string; value: string }[]) ?? [];
  const ph = (brief.priority_hotspots as { path: string; why_relevant: string }[]) ?? [];
  const ep = (brief.recommended_entry_points as { path: string; symbol: string | null; reason: string }[]) ?? [];
  const constraints = (brief.constraints as string[]) ?? [];
  const blockers = ((threat?.blockers as unknown[]) ?? []).length;
  const warnings = ((threat?.warnings as unknown[]) ?? []).length;

  // Top 3 hotspots compact
  const topHotspots = hotspots.slice(0, 3).map((h: unknown) => {
    const hs = h as Record<string, unknown>;
    return `${hs.path}[${hs.risk_level},${Number(hs.score).toFixed(2)}]`;
  });

  // Top 3 blast radius compact
  const topBlast = blastRadius.slice(0, 3).map((b: unknown) => {
    const br = b as Record<string, unknown>;
    return `${br.trigger_file}→${br.total_affected_files}files`;
  });

  // Compact ~500-token Mahadata brief
  const lines = [
    `[MAHADATA v2.1]`,
    `repo:${repo?.name ?? args.path} | lang:${repo?.primary_language ?? "?"} | files:${repo?.total_files ?? "?"} | loc:${repo?.total_loc ?? "?"}`,
    `objective:${brief.objective}`,
    `summary:${brief.repository_summary}`,
    ``,
    `CTX: ${ctx.map((c) => `${c.key}=${c.value}`).join(" | ")}`,
    ``,
    `HOTSPOTS(top3): ${topHotspots.join(", ")}`,
    `BLAST(top3): ${topBlast.join(", ")}`,
    ``,
    `ENTRY_POINTS:`,
    ...ep.slice(0, 3).map((e) => `  ${e.path}${e.symbol ? `::${e.symbol}` : ""} — ${e.reason}`),
    ``,
    `CONSTRAINTS: ${constraints.slice(0, 3).join(" | ")}`,
    `THREAT: risk=${Number(threat?.overall_risk_score ?? 0).toFixed(2)} | ${threat?.risk_summary ?? ""} | blockers:${blockers} warnings:${warnings}`,
    ``,
    `[END MAHADATA — use analyze_repo or blast_radius for full detail]`,
  ].join("\n");

  return { content: [{ type: "text", text: lines }] };
}
