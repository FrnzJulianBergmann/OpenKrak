// openkrak-mcp/src/tools/analyze_repo.ts
import { runPipeline } from "dorchester";

export async function handleAnalyzeRepo(args: {
  path: string;
  objective?: string;
}) {
  const result = await runPipeline({
    repoPath: args.path,
    objective: args.objective ?? "Analyze repository",
  });

  if (result.status === "failed") {
    return {
      content: [{ type: "text", text: `Analysis failed: ${result.error}` }],
      isError: true,
    };
  }

  const mahadata = result.mahadata as Record<string, unknown>;
  const meta = mahadata.meta as Record<string, unknown> | undefined;
  const repo = mahadata.repository as Record<string, unknown> | undefined;
  const hotspots = mahadata.hotspots as unknown[] | undefined;
  const findings = mahadata.findings as unknown[] | undefined;
  const brief = mahadata.execution_brief as Record<string, unknown> | undefined;

  const summary = [
    `# OpenKrak Analysis — ${repo?.name ?? args.path}`,
    `Status: ${result.status} (${result.durationMs}ms)`,
    `Files: ${repo?.total_files ?? "?"} | LOC: ${repo?.total_loc ?? "?"}`,
    `Language: ${repo?.primary_language ?? "?"} | Framework: ${repo?.framework ?? "none"}`,
    ``,
    `## Hotspots (${hotspots?.length ?? 0} files)`,
    ...(hotspots?.slice(0, 5).map((h: unknown) => {
      const hs = h as Record<string, unknown>;
      return `- ${hs.path} [${hs.risk_level}] score: ${Number(hs.score).toFixed(2)}`;
    }) ?? []),
    ``,
    `## Findings (${findings?.length ?? 0} total)`,
    ``,
    `## Execution Brief`,
    brief?.objective ? `Objective: ${brief.objective}` : "",
    brief?.repository_summary ? `Summary: ${brief.repository_summary}` : "",
    ``,
    `Scan ID: ${(meta?.scan_id as string) ?? "?"}`,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    content: [{ type: "text", text: summary }],
  };
}
