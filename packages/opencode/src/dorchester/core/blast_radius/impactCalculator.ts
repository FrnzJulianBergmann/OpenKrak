// engine/core/blast_radius/impactCalculator.ts
// Blast Radius Engine — Step 2 (direct) + Step 3 (transitive) Impact Calculator
// blast_radius_engine.md §5 Step 2–3 + §6 Traversal Rules + §7 Confidence Score Policy
// Constitution Rule 3: Pure deterministic graph traversal. No probabilistic estimation.

import type { DependencyGraph, EdgeKind } from "../../contracts/index.js";

export interface FileImpact {
  path: string;
  impact_type: "direct" | "transitive";
  depth: number;
  confidence: number;
}

const MAX_DEPTH = 5; // §6.2 — hard cap, no config override without ACP

const CONFIDENCE_BY_DEPTH: Record<number, number> = {
  1: 1.0,
  2: 0.9,
  3: 0.75,
  4: 0.6,
  5: 0.45,
};

// §6.1 Edge Inclusion Policy
const TRAVERSABLE_EDGE_KINDS: ReadonlySet<EdgeKind> = new Set<EdgeKind>([
  "import",
  "call",
  "extend",
  "implement",
  "instantiate",
  "type_reference",
  "re_export_resolved",
]);
// "re_export" skipped — already resolved via re_export_resolved (§6.1)
// "dynamic_import" skipped — confidence too low (§6.1)

/**
 * Computes direct (depth 1) + transitive (depth 2-5) impact for a single
 * trigger file, via reverse BFS on the dependency graph: "who depends on T".
 */
export function computeImpactForTrigger(
  triggerFile: string,
  graph: DependencyGraph,
): FileImpact[] {
  // Build reverse adjacency: target node -> [source nodes] for traversable edges
  const reverseAdj = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (!TRAVERSABLE_EDGE_KINDS.has(edge.kind)) continue;
    if (!reverseAdj.has(edge.to)) reverseAdj.set(edge.to, []);
    reverseAdj.get(edge.to)!.push(edge.from);
  }

  // node -> file
  const nodeFile = new Map<string, string>();
  for (const node of graph.nodes) nodeFile.set(node.id, node.file);

  // trigger node ids = all nodes whose file === triggerFile
  const triggerNodeIds = graph.nodes
    .filter((n) => n.file === triggerFile)
    .map((n) => n.id);

  if (triggerNodeIds.length === 0) {
    // Trigger file not in dependency_graph — skip per §8 error handling
    return [];
  }

  const fileBestDepth = new Map<string, number>(); // file -> minimum depth found
  const visited = new Set<string>(triggerNodeIds);

  let frontier = triggerNodeIds;
  let depth = 1;

  while (frontier.length > 0 && depth <= MAX_DEPTH) {
    const nextFrontier: string[] = [];

    for (const nodeId of frontier) {
      const sources = reverseAdj.get(nodeId) ?? [];
      for (const srcId of sources) {
        if (visited.has(srcId)) continue;
        visited.add(srcId);

        const srcFile = nodeFile.get(srcId);
        if (srcFile && srcFile !== triggerFile) {
          if (!fileBestDepth.has(srcFile)) {
            fileBestDepth.set(srcFile, depth);
          }
        }
        nextFrontier.push(srcId);
      }
    }

    frontier = nextFrontier;
    depth += 1;
  }

  const impacts: FileImpact[] = [];
  for (const [file, d] of fileBestDepth) {
    impacts.push({
      path: file,
      impact_type: d === 1 ? "direct" : "transitive",
      depth: d,
      confidence: CONFIDENCE_BY_DEPTH[d] ?? 0,
    });
  }

  return impacts;
}
