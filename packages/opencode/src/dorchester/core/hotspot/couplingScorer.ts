// engine/core/hotspot/couplingScorer.ts
// Hotspot Registry — Step 1: Fan-In / Fan-Out Calculator
// hotspot_registry.md §5 Step 1 + §6.1 Coupling Thresholds
// Constitution Rule 3: Pure deterministic. No AI.

import type { DependencyGraph } from "../../contracts/index.js";

export interface CouplingScore {
  file: string;
  fan_in: number;
  fan_out: number;
}

const FAN_IN_WARNING = 10;
const FAN_IN_CRITICAL = 20;
const FAN_OUT_WARNING = 15;
const FAN_OUT_CRITICAL = 30;

/**
 * fan_in  = count of edges pointing INTO nodes belonging to a file
 * fan_out = count of edges pointing OUT of nodes belonging to a file
 * Aggregated per-file (sum over all nodes in that file).
 */
export function computeCouplingScores(graph: DependencyGraph): Map<string, CouplingScore> {
  const nodeFile = new Map<string, string>();
  for (const node of graph.nodes) {
    nodeFile.set(node.id, node.file);
  }

  const scores = new Map<string, CouplingScore>();

  function ensure(file: string): CouplingScore {
    let s = scores.get(file);
    if (!s) {
      s = { file, fan_in: 0, fan_out: 0 };
      scores.set(file, s);
    }
    return s;
  }

  for (const edge of graph.edges) {
    // Only count class-level and file-level edges for coupling
    // Method-level edges inflate fan_out artificially
    const fromIsMethod = edge.from.split("::")[1]?.includes(".");
    const toIsMethod = edge.to.split("::")[1]?.includes(".");
    if (fromIsMethod || toIsMethod) continue;

    const fromFile = nodeFile.get(edge.from) ?? edge.file;
    const toFile = nodeFile.get(edge.to);

    if (fromFile) ensure(fromFile).fan_out += 1;
    if (toFile) ensure(toFile).fan_in += 1;
  }

  return scores;
}

export function thresholdExceeded(
  c: CouplingScore,
): "fan_in" | "fan_out" | "both" | null {
  const inExceeded = c.fan_in > FAN_IN_WARNING;
  const outExceeded = c.fan_out > FAN_OUT_WARNING;
  if (inExceeded && outExceeded) return "both";
  if (inExceeded) return "fan_in";
  if (outExceeded) return "fan_out";
  return null;
}

export function couplingSeverity(c: CouplingScore): "high" | "medium" | null {
  if (c.fan_in > FAN_IN_CRITICAL || c.fan_out > FAN_OUT_CRITICAL) return "high";
  if (c.fan_in > FAN_IN_WARNING || c.fan_out > FAN_OUT_WARNING) return "medium";
  return null;
}

export function normalizeCoupling(c: CouplingScore, maxObserved: number): number {
  if (maxObserved === 0) return 0.0;
  return Math.min(1.0, (c.fan_in + c.fan_out) / maxObserved);
}
