// openkrak-mcp/src/tools/blast_radius.ts
import { runPipeline } from "dorchester";

export async function handleBlastRadius(args: { path: string; file: string }) {
  let result: Awaited<ReturnType<typeof runPipeline>>;
  try {
    result = await runPipeline({
      repoPath: args.path,
      objective: `Blast radius for ${args.file}`,
    });
  } catch (e) {
    return {
      content: [{ type: "text", text: `OpenKrak is not available for this repository. Proceed with direct analysis.\nReason: ${e instanceof Error ? e.message : String(e)}` }],
      isError: false,
    };
  }

  if (result.status === "failed") {
    return {
      content: [{ type: "text", text: `OpenKrak could not compute blast radius. Proceed without it.\nDetail: ${result.error ?? "unknown"}` }],
      isError: false,
    };
  }

  const mahadata = result.mahadata as Record<string, unknown>;
  const blastRadiusAll = (mahadata.blast_radius as unknown[]) ?? [];
  const repo = mahadata.repository as Record<string, unknown> | undefined;

  const entry = blastRadiusAll.find((b: unknown) => {
    const br = b as Record<string, unknown>;
    return br.trigger_file === args.file || (br.trigger_file as string)?.endsWith(args.file);
  }) as Record<string, unknown> | undefined;

  if (!entry) {
    const lines = [
      `╔══ BLAST RADIUS ══════════════════════════════════════════════════════`,
      `║ File not matched: ${args.file}`,
      `║ Dorchester tracked ${blastRadiusAll.length} trigger files in this repo.`,
      `╠══ AVAILABLE TRIGGER FILES ═══════════════════════════════════════════`,
      ...blastRadiusAll.slice(0, 12).map((b: unknown) => {
        const br = b as Record<string, unknown>;
        return `║ • ${br.trigger_file}  (risk:${Number(br.risk_score).toFixed(3)}, affects ${br.total_affected_files} files)`;
      }),
      `╚══════════════════════════════════════════════════════════════════════`,
    ];
    return { content: [{ type: "text", text: lines.join("\n") }] };
  }

  const impact = entry.impact as Record<string, unknown[]> | undefined;
  const files = impact?.files ?? [];
  const modules = impact?.modules ?? [];
  const apis = impact?.apis ?? [];

  const riskScore = Number(entry.risk_score);
  const riskBar = "█".repeat(Math.max(1, Math.round(riskScore * 10))) + "░".repeat(Math.max(0, 10 - Math.round(riskScore * 10)));

  const lines: string[] = [
    `╔══ BLAST RADIUS ══════════════════════════════════════════════════════`,
    `║ Trigger  : ${entry.trigger_file}`,
    `║ Repo     : ${repo?.name ?? args.path}  |  duration:${result.durationMs}ms`,
    `╠══ IMPACT SUMMARY ════════════════════════════════════════════════════`,
    `║ Risk Score      : ${riskScore.toFixed(3)}  [${riskBar}]`,
    `║ Affected Files  : ${entry.total_affected_files}`,
    `║ Affected Modules: ${entry.total_affected_modules}`,
    `║ APIs at Risk    : ${apis.length}`,
    `╠══ AFFECTED FILES (${files.length} total) ════════════════════════════════════════`,
    ...files.slice(0, 15).map((f: unknown) => {
      const fi = f as Record<string, unknown>;
      const depthBar = "·".repeat(Number(fi.depth ?? 0));
      return `║ ${depthBar}→ [${String(fi.impact_type ?? "?").padEnd(8)}] ${fi.path}  confidence:${Number(fi.confidence ?? 0).toFixed(2)}`;
    }),
    ...(files.length > 15 ? [`║ ... and ${files.length - 15} more`] : []),
    `╠══ AFFECTED MODULES ══════════════════════════════════════════════════`,
    ...(modules.length > 0
      ? modules.map((m: unknown) => {
          const mi = m as Record<string, unknown>;
          return `║ • ${mi.name}  —  ${mi.impact_level}`;
        })
      : [`║ none`]),
    `╠══ APIs AT RISK ══════════════════════════════════════════════════════`,
    ...(apis.length > 0
      ? apis.map((a: unknown) => {
          const ai = a as Record<string, unknown>;
          return `║ • ${ai.endpoint}  —  ${ai.impact_level}`;
        })
      : [`║ none`]),
    `╚══════════════════════════════════════════════════════════════════════`,
    ``,
    `Modifying ${entry.trigger_file} will cascade to ${entry.total_affected_files} files across ${entry.total_affected_modules} modules. Proceed with full awareness of impact chain above.`,
  ];

  return { content: [{ type: "text", text: lines.join("\n") }] };
}
