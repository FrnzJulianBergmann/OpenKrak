// engine/core/blast_radius/triggerSelector.ts
// Blast Radius Engine — Step 1: Trigger File Selection
// blast_radius_engine.md §5 Step 1
// Constitution Rule 3: Pure deterministic. No AI.

import type { DependencyGraph, Hotspot, ProjectTopology, Finding } from "../../contracts/index.js";

export interface TriggerCandidate {
  file: string;
  trigger_type: "modification" | "interface_change" | "deletion";
}

/**
 * Trigger candidates (§5 Step 1):
 *  a. All files with hotspot.risk_level = "critical" | "high"
 *  b. All entry points from project_topology.entry_points
 *  c. All files involved in circular_dependency findings
 *
 * trigger_type:
 *   "interface_change" if file exports interface/type/class publicly
 *   "modification"     default for everything else
 *   "deletion"         reserved for future — never assigned in static scan
 */
export function selectTriggerCandidates(
  hotspots: Hotspot[],
  topology: ProjectTopology | null,
  graph: DependencyGraph,
  findings: Finding[],
): TriggerCandidate[] {
  const candidateFiles = new Set<string>();

  for (const h of hotspots) {
    if (h.risk_level === "critical" || h.risk_level === "high") {
      candidateFiles.add(h.path);
    }
  }

  if (topology) {
    for (const ep of topology.entry_points) {
      candidateFiles.add(ep.path);
    }
  }

  for (const f of findings) {
    if (f.type === "circular_dependency") {
      candidateFiles.add(f.file);
    }
  }

  // files that export interface/type_alias/class publicly -> interface_change
  const interfaceExportFiles = new Set<string>();
  for (const node of graph.nodes) {
    if (
      node.is_exported &&
      (node.kind === "interface" || node.kind === "type_alias" || node.kind === "class")
    ) {
      interfaceExportFiles.add(node.file);
    }
  }

  return [...candidateFiles].map((file) => ({
    file,
    trigger_type: interfaceExportFiles.has(file) ? "interface_change" : "modification",
  }));
}
