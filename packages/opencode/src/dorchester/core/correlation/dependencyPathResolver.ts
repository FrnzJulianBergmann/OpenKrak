// engine/core/correlation/dependencyPathResolver.ts
// Correlation Engine — Step 2: Dependency Path Resolver
// correlation_engine.md §5 Step 2 + §11 DependencyGraphReader interface
// Constitution Rule 3: Pure deterministic graph traversal.

import type { DependencyGraph, EdgeKind } from "../../contracts/index.js";

/** correlation_engine.md §11 — DependencyGraphReader interface */
export interface DependencyGraphReader {
  getDirectDependencies(nodeId: string): string[];
  getTransitiveDependencies(nodeId: string, maxDepth: number): string[];
  getShortestPath(fromId: string, toId: string): string[] | null;
  hasCycle(nodeId: string): boolean;
}

/**
 * Edge kinds included in traversal per blast_radius_engine.md §6.1
 * and correlation_engine.md §11 (re_export_resolved for path traversal)
 */
const TRAVERSAL_EDGES = new Set<EdgeKind>([
  "import",
  "call",
  "extend",
  "implement",
  "instantiate",
  "type_reference",
  "re_export_resolved",
]);

export function createDependencyGraphReader(graph: DependencyGraph): DependencyGraphReader {
  // Build adjacency map using TRAVERSAL_EDGES
  // CRITICAL: use re_export_resolved, NOT re_export (barrel hop)
  // per correlation_engine.md §11 behavioral contract
  const adjMap = new Map<string, string[]>(); // from → [to]
  const reverseMap = new Map<string, string[]>(); // to → [from]

  for (const edge of graph.edges) {
    if (!TRAVERSAL_EDGES.has(edge.kind)) continue;
    // Skip raw barrel imports — use re_export_resolved instead
    if (edge.kind === "import" && edge.is_barrel_import) continue;

    if (!adjMap.has(edge.from)) adjMap.set(edge.from, []);
    adjMap.get(edge.from)!.push(edge.to);

    if (!reverseMap.has(edge.to)) reverseMap.set(edge.to, []);
    reverseMap.get(edge.to)!.push(edge.from);
  }

  // Detect cycles per node (used for hasCycle)
  const cycleNodes = new Set<string>();
  for (const cyclePath of graph.stats.cycle_paths) {
    for (const nodeId of cyclePath) cycleNodes.add(nodeId);
  }

  return {
    getDirectDependencies(nodeId: string): string[] {
      return adjMap.get(nodeId) ?? [];
    },

    getTransitiveDependencies(nodeId: string, maxDepth: number): string[] {
      const visited = new Set<string>();
      const queue: { id: string; depth: number }[] = [{ id: nodeId, depth: 0 }];
      const result: string[] = [];

      while (queue.length > 0) {
        const { id, depth } = queue.shift()!;
        if (visited.has(id)) continue;
        visited.add(id);
        if (id !== nodeId) result.push(id);
        if (depth < maxDepth) {
          for (const neighbor of adjMap.get(id) ?? []) {
            if (!visited.has(neighbor)) {
              queue.push({ id: neighbor, depth: depth + 1 });
            }
          }
        }
      }
      return result;
    },

    getShortestPath(fromId: string, toId: string): string[] | null {
      // BFS — uses re_export_resolved edges, not barrel hops
      // Barrel nodes are NOT counted as a depth level (§11 contract)
      const visited = new Set<string>([fromId]);
      const queue: { id: string; path: string[] }[] = [{ id: fromId, path: [fromId] }];

      while (queue.length > 0) {
        const { id, path } = queue.shift()!;
        if (id === toId) return path;
        for (const neighbor of adjMap.get(id) ?? []) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            queue.push({ id: neighbor, path: [...path, neighbor] });
          }
        }
      }
      return null; // no path found
    },

    hasCycle(nodeId: string): boolean {
      return cycleNodes.has(nodeId);
    },
  };
}
