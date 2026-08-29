// openkrak-mcp/src/tools/get_hotspots.ts
import { runPipeline } from "dorchester";

export async function handleGetHotspots(args: { path: string }) {
  const result = await runPipeline({
    repoPath: args.path,
    objective: "Identify hotspots",
  });

  if (result.status === "failed") {
    return {
      content: [{ type: "text", text: `Analysis failed: ${result.error}` }],
      isError: true,
    };
  }

  const mahadata = result.mahadata as Record<string, unknown>;
  const hotspots = (mahadata.hotspots as unknown[]) ?? [];

  if (hotspots.length === 0) {
    return {
      content: [{ type: "text", text: "No hotspots detected." }],
    };
  }

  const lines = [
    `# Hotspots — ${hotspots.length} files ranked by risk`,
    "",
    ...hotspots.map((h: unknown, i: number) => {
      const hs = h as Record<string, unknown>;
      const reasons = (hs.reasons as { type: string; detail: string }[]) ?? [];
      return [
        `## ${i + 1}. ${hs.path}`,
        `Risk: ${hs.risk_level} | Score: ${Number(hs.score).toFixed(3)} | Changes: ${hs.change_frequency}`,
        `Reasons: ${reasons.map((r) => r.type).join(", ")}`,
      ].join("\n");
    }),
  ].join("\n");

  return { content: [{ type: "text", text: lines }] };
}
