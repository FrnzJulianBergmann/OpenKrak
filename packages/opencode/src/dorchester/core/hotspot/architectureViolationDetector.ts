// engine/core/hotspot/architectureViolationDetector.ts
// Hotspot Registry — Step 3: Architecture Violation Detector
// hotspot_registry.md §5 Step 3 + §6.3 Architecture Layer Rules
// Constitution Rule 3: Pure deterministic. No AI.

import type { DependencyGraph, ProjectTopology } from "../../contracts/index.js";

export interface ArchitectureViolation {
  file: string;
  from_layer: string;
  to_layer: string;
  violation_rule: string;
}

const DEFAULT_VIOLATION_RULES: [string, string][] = [
  ["domain", "infrastructure"],
  ["domain", "presentation"],
  ["application", "presentation"],
];

const EXEMPT_LAYERS = new Set(["utility", "config", "shared"]);

/**
 * §6.3: if project_topology.layers is undefined/empty, this step is skipped
 * entirely — no architecture_violation finding is emitted (per spec, this is
 * a normal condition, not an error).
 */
export function detectArchitectureViolations(
  graph: DependencyGraph,
  topology: ProjectTopology | null,
  fileRole: Map<string, string>, // file path -> file_index.role
): ArchitectureViolation[] {
  if (!topology || !topology.layers || topology.layers.length === 0) {
    return [];
  }

  const fileToLayer = new Map<string, string>();
  for (const layer of topology.layers) {
    for (const path of layer.paths) {
      fileToLayer.set(path, layer.name);
    }
  }

  const violations: ArchitectureViolation[] = [];

  for (const edge of graph.edges) {
    const fromFile = edge.file;
    // resolve "to" node's file via target node id encoding: "<file>::..."
    const toFile = edge.to.split("::")[0] ?? edge.to;

    const fromLayer = fileToLayer.get(fromFile);
    const toLayer = fileToLayer.get(toFile);

    if (!fromLayer || !toLayer) continue;
    if (fromLayer === toLayer) continue;

    // test files exempt regardless of layer
    if (fileRole.get(fromFile) === "test") continue;
    // utility/config/shared targets are always allowed
    if (EXEMPT_LAYERS.has(toLayer)) continue;

    const isViolation = DEFAULT_VIOLATION_RULES.some(
      ([from, to]) => from === fromLayer && to === toLayer,
    );

    if (isViolation) {
      violations.push({
        file: fromFile,
        from_layer: fromLayer,
        to_layer: toLayer,
        violation_rule: `${fromLayer} -> ${toLayer} is forbidden`,
      });
    }
  }

  return violations;
}
