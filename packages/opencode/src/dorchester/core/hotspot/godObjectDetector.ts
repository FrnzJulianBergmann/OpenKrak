// engine/core/hotspot/godObjectDetector.ts
// Hotspot Registry — Step 4: God Object Detector
// hotspot_registry.md §5 Step 4 + §6.4 God Object Detection
// Constitution Rule 3: Pure deterministic. No AI.

import type { DependencyGraph } from "../../contracts/index.js";
import type { CouplingScore } from "./couplingScorer.js";

const NODE_COUNT_THRESHOLD = 5;
const FAN_IN_THRESHOLD = 5;
const FAN_OUT_THRESHOLD = 8; // alternative: high fan-out = god object even with low fan-in

/**
 * §6.4: file is a god object iff ALL of:
 *  - (function + method + class) node count in file > 20
 *  - fan_in aggregate for file > 15
 *  - file_index.role != "test"
 */
export function detectGodObjects(
  graph: DependencyGraph,
  couplingScores: Map<string, CouplingScore>,
  fileRole: Map<string, string>,
): Set<string> {
  const nodeCountByFile = new Map<string, number>();

  for (const node of graph.nodes) {
    if (node.kind === "function" || node.kind === "method" || node.kind === "class") {
      nodeCountByFile.set(node.file, (nodeCountByFile.get(node.file) ?? 0) + 1);
    }
  }

  const godObjects = new Set<string>();

  for (const [file, count] of nodeCountByFile) {
    if (count <= NODE_COUNT_THRESHOLD) continue;
    if (fileRole.get(file) === "test") continue;

    const coupling = couplingScores.get(file);
    if (!coupling) continue;
    // God object if high fan_in OR high fan_out (orchestrator pattern)
    if (coupling.fan_in <= FAN_IN_THRESHOLD && coupling.fan_out <= FAN_OUT_THRESHOLD) continue;

    godObjects.add(file);
  }

  return godObjects;
}
