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
  /** O(V+E) BFS from one source — returns shortest path to EVERY reachable node at once.
   *  Use this instead of calling getShortestPath() per-pair to avoid O(n²) BFS overhead. */
  getShortestPathsFromSource(fromId: string): Map<string, string[]>;
  hasCycle(nodeId: string): boolean;
}

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
  const adjMap = new Map<string, string[]>();
  const reverseMap = new Map<string, string[]>();

  for (const edge of graph.edges) {
    if (!TRAVERSAL_EDGES.has(edge.kind)) continue;
    if (edge.kind === "import" && edge.is_barrel_import) continue;

    if (!adjMap.has(edge.from)) adjMap.set(edge.from, []);
    adjMap.get(edge.from)!.push(edge.to);

    if (!reverseMap.has(edge.to)) reverseMap.set(edge.to, []);
    reverseMap.get(edge.to)!.push(edge.from);
  }

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
            if (!visited.has(neighbor)) queue.push({ id: neighbor, depth: depth + 1 });
          }
        }
      }
      return result;
    },

    getShortestPath(fromId: string, toId: string): string[] | null {
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
      return null;
    },

    /**
     * Single-source BFS — O(V+E) total. Replaces calling getShortestPath()
     * N times (which would be O(N × (V+E))). Returns a map of nodeId → path
     * for every node reachable from `fromId`.
     */
    getShortestPathsFromSource(fromId: string): Map<string, string[]> {
      const result = new Map<string, string[]>();
      const visited = new Set<string>([fromId]);
      const queue: { id: string; path: string[] }[] = [{ id: fromId, path: [fromId] }];

      while (queue.length > 0) {
        const { id, path } = queue.shift()!;
        result.set(id, path);
        for (const neighbor of adjMap.get(id) ?? []) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            queue.push({ id: neighbor, path: [...path, neighbor] });
          }
        }
      }
      return result;
    },

    hasCycle(nodeId: string): boolean {
      return cycleNodes.has(nodeId);
    },
  };
}
