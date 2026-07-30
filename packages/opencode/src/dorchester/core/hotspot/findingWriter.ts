// engine/core/hotspot/findingWriter.ts
// Hotspot Registry — Step 7: Finding Writer
// hotspot_registry.md §5 Step 7 + §6.1/§6.2/§6.3 raw_data shapes
// mahadata_schema.md §4.7.1 — raw_data typed per finding type
// Constitution Rule 3: Pure deterministic. No AI.
// Ownership: is_structural = false, source_component = "hotspot_registry" (§4.13)

import { randomUUID } from "node:crypto";
import type { Finding, DependencyGraph } from "../../contracts/index.js";
import type { CouplingScore } from "./couplingScorer.js";
import { thresholdExceeded as couplingThresholdExceeded, couplingSeverity } from "./couplingScorer.js";
import type { ComplexityScore } from "./complexityScorer.js";
import { complexityThresholdExceeded, complexitySeverity } from "./complexityScorer.js";
import type { ArchitectureViolation } from "./architectureViolationDetector.js";

/** Build map: file -> primary class node ID (fallback to file::file::0) */
function buildPrimarySymbolMap(nodes: DependencyGraph["nodes"]): Map<string, string> {
  const map = new Map<string, string>();
  for (const node of nodes) {
    if (node.kind === "class") {
      if (!map.has(node.file)) map.set(node.file, node.id);
    }
  }
  // fallback: file::file::0 for files with no class node
  for (const node of nodes) {
    if (node.kind === "file" && !map.has(node.file)) {
      map.set(node.file, node.id);
    }
  }
  return map;
}

export function buildCouplingFindings(scores: Iterable<CouplingScore>, graphNodes?: DependencyGraph["nodes"]): Finding[] {
  const primarySymbol = graphNodes ? buildPrimarySymbolMap(graphNodes) : new Map<string, string>();
  const findings: Finding[] = [];
  for (const c of scores) {
    const exceeded = couplingThresholdExceeded(c);
    const severity = couplingSeverity(c);
    if (!exceeded || !severity) continue;

    const symbol = primarySymbol.get(c.file) ?? null;

    findings.push({
      id: randomUUID(),
      type: "coupling_issue",
      severity,
      file: c.file,
      line_start: null,
      line_end: null,
      symbol,
      title: `High coupling in ${c.file}`,
      description: `fan_in=${c.fan_in}, fan_out=${c.fan_out} exceeds threshold (${exceeded})`,
      raw_data: {
        fan_in: c.fan_in,
        fan_out: c.fan_out,
        coupling_score: Math.min(1.0, (c.fan_in + c.fan_out) / 50),
        threshold_exceeded: exceeded,
      },
      source_component: "hotspot_registry",
      is_structural: false,
    });
  }
  return findings;
}

export function buildComplexityFindings(scores: ComplexityScore[]): Finding[] {
  const findings: Finding[] = [];
  for (const c of scores) {
    const exceeded = complexityThresholdExceeded(c);
    const severity = complexitySeverity(c);
    if (!exceeded || !severity) continue;

    findings.push({
      id: randomUUID(),
      type: "complexity_issue",
      severity,
      file: c.file,
      line_start: null,
      line_end: null,
      symbol: null,
      title: `High complexity in symbol`,
      description: `loc=${c.loc} exceeds threshold (${exceeded})`,
      raw_data: {
        cyclomatic_complexity: c.cyclomatic,
        loc: c.loc,
        cognitive_complexity: c.cognitive,
        threshold_exceeded: exceeded,
      },
      source_component: "hotspot_registry",
      is_structural: false,
    });
  }
  return findings;
}

export function buildArchitectureViolationFindings(
  violations: ArchitectureViolation[],
): Finding[] {
  return violations.map((v) => ({
    id: randomUUID(),
    type: "architecture_violation",
    severity: "medium",
    file: v.file,
    line_start: null,
    line_end: null,
    symbol: null,
    title: `Layer violation: ${v.from_layer} -> ${v.to_layer}`,
    description: v.violation_rule,
    raw_data: {
      from_layer: v.from_layer,
      to_layer: v.to_layer,
      violation_rule: v.violation_rule,
    },
    source_component: "hotspot_registry",
    is_structural: false,
  }));
}
