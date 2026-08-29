// openkrak-mcp/src/tools/blast_radius.ts
import { runPipeline } from "dorchester";

export async function handleBlastRadius(args: { path: string; file: string }) {
  const result = await runPipeline({
    repoPath: args.path,
    objective: `Blast radius for ${args.file}`,
  });

  if (result.status === "failed") {
    return {
      content: [{ type: "text", text: `Analysis failed: ${result.error}` }],
      isError: true,
    };
  }

  const mahadata = result.mahadata as Record<string, unknown>;
  const blastRadiusAll = (mahadata.blast_radius as unknown[]) ?? [];

  const entry = blastRadiusAll.find((b: unknown) => {
    const br = b as Record<string, unknown>;
    return (
      br.trigger_file === args.file ||
      (br.trigger_file as string)?.endsWith(args.file)
    );
  }) as Record<string, unknown> | undefined;

  if (!entry) {
    const lines = [
      `# Blast Radius — file not matched: ${args.file}`,
      `Available trigger files: ${blastRadiusAll.length}`,
      ...blastRadiusAll.slice(0, 10).map((b: unknown) => {
        const br = b as Record<string, unknown>;
        return `- ${br.trigger_file} (risk: ${Number(br.risk_score).toFixed(2)}, affects ${br.total_affected_files} files)`;
      }),
    ].join("\n");
    return { content: [{ type: "text", text: lines }] };
  }

  const impact = entry.impact as Record<string, unknown[]>;
  const lines = [
    `# Blast Radius — ${entry.trigger_file}`,
    `Risk Score: ${Number(entry.risk_score).toFixed(3)}`,
    `Affected Files: ${entry.total_affected_files} | Modules: ${entry.total_affected_modules}`,
    ``,
    `## Affected Files (top 10)`,
    ...(impact.files ?? []).slice(0, 10).map((f: unknown) => {
      const fi = f as Record<string, unknown>;
      return `- [${fi.impact_type}] ${fi.path} (depth: ${fi.depth}, confidence: ${Number(fi.confidence).toFixed(2)})`;
    }),
    ``,
    `## Affected Modules`,
    ...(impact.modules ?? []).map((m: unknown) => {
      const mi = m as Record<string, unknown>;
      return `- ${mi.name}: ${mi.impact_level}`;
    }),
    ``,
    `## APIs at Risk`,
    ...(impact.apis ?? []).map((a: unknown) => {
      const ai = a as Record<string, unknown>;
      return `- ${ai.endpoint}: ${ai.impact_level}`;
    }),
  ].join("\n");

  return { content: [{ type: "text", text: lines }] };
}
