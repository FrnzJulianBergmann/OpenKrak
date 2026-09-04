// openkrak-mcp/src/tools/get_hotspots.ts
import { runPipeline } from "dorchester";

export async function handleGetHotspots(args: { path: string }) {
  let result: Awaited<ReturnType<typeof runPipeline>>;
  try {
    result = await runPipeline({
      repoPath: args.path,
      objective: "Identify hotspots",
    });
  } catch (e) {
    return {
      content: [{ type: "text", text: `OpenKrak is not available for this repository. Proceed with direct file analysis.\nReason: ${e instanceof Error ? e.message : String(e)}` }],
      isError: false,
    };
  }

  if (result.status === "failed") {
    return {
      content: [{ type: "text", text: `OpenKrak could not complete hotspot analysis. Proceed without it.\nDetail: ${result.error ?? "unknown"}` }],
      isError: false,
    };
  }

  const mahadata = result.mahadata as Record<string, unknown>;
  const hotspots = (mahadata.hotspots as unknown[]) ?? [];
  const repo = mahadata.repository as Record<string, unknown> | undefined;

  if (hotspots.length === 0) {
    return {
      content: [{ type: "text", text: `OpenKrak: no hotspots detected in ${repo?.name ?? args.path}. Repository appears low-risk.` }],
    };
  }

  const lines: string[] = [
    `╔══ HOTSPOT REGISTRY ══════════════════════════════════════════════════`,
    `║ ${repo?.name ?? args.path}  |  ${hotspots.length} files ranked by composite risk score`,
    `║ duration: ${result.durationMs}ms`,
    `╠══════════════════════════════════════════════════════════════════════`,
    ...hotspots.map((h: unknown, i: number) => {
      const hs = h as Record<string, unknown>;
      const reasons = (hs.reasons as { type: string; detail?: string }[]) ?? [];
      const score = Number(hs.score);
      const bar = "█".repeat(Math.max(1, Math.round(score * 10))) + "░".repeat(Math.max(0, 10 - Math.round(score * 10)));
      return [
        `║`,
        `║  ${String(i + 1).padStart(2)}. ${hs.path}`,
        `║      Risk     : ${String(hs.risk_level).toUpperCase()}  |  Score: ${score.toFixed(3)}  [${bar}]`,
        `║      Changes  : ${hs.change_frequency}  |  Flags: ${reasons.map(r => r.type).join(", ")}`,
        ...(reasons.filter(r => r.detail).slice(0, 2).map(r => `║      Detail   : ${r.detail}`)),
      ].join("\n");
    }),
    `╚══════════════════════════════════════════════════════════════════════`,
    ``,
    `Touch these files with caution. Prioritize review in order listed.`,
  ];

  return { content: [{ type: "text", text: lines.join("\n") }] };
}
