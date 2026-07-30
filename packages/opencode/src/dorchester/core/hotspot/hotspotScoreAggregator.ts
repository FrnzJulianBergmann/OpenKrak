// engine/core/hotspot/hotspotScoreAggregator.ts
// Hotspot Registry — Step 5 (cycle marker) + Step 6: Hotspot Score Aggregator
// hotspot_registry.md §5 Step 5–6 + §6.5 Normalisasi Score
// Constitution Rule 3: Pure deterministic. No AI.

import { randomUUID } from "node:crypto";
import type { Finding, Hotspot, HotspotReasonType, DependencyGraph } from "../../contracts/index.js";
import type { CouplingScore } from "./couplingScorer.js";
import type { ComplexityScore } from "./complexityScorer.js";
import type { ArchitectureViolation } from "./architectureViolationDetector.js";

export function normalize(value: number, maxObserved: number): number {
  if (maxObserved === 0) return 0.0;
  return Math.min(1.0, value / maxObserved);
}

function riskLevel(score: number): "critical" | "high" | "medium" | "low" {
  if (score >= 0.55) return "critical";
  if (score >= 0.30) return "high";
  if (score >= 0.15) return "medium";
  return "low";
}

export function aggregateHotspots(params: {
  files: Set<string>;
  couplingScores: Map<string, CouplingScore>;
  complexityScores: ComplexityScore[];
  violations: ArchitectureViolation[];
  godObjects: Set<string>;
  cycleFindings: Finding[];
  affectedSymbolsByFile: Map<string, string[]>;
  cyclePaths?: string[][];
  graph: DependencyGraph;
}): Hotspot[] {
  const {
    files,
    couplingScores,
    complexityScores,
    violations,
    godObjects,
    cycleFindings,
    affectedSymbolsByFile,
    cyclePaths = [],
    graph,
  } = params;

  // Build file-level cycle participation from graph cycle_paths (more accurate)
  const cycleFilesFromPaths = new Map<string, number>();
  for (const path of cyclePaths) {
    const filesInCycle = new Set(path.map((nodeId: string) => nodeId.split("::")[0]));
    for (const f of filesInCycle) {
      cycleFilesFromPaths.set(f, (cycleFilesFromPaths.get(f) ?? 0) + 1);
    }
  }

  // max_observed for normalization — relative to this scan only (§6.5)
  const maxCoupling = Math.max(
    0,
    ...[...couplingScores.values()].map((c) => c.fan_in + c.fan_out),
  );


  const violationsByFile = new Map<string, ArchitectureViolation[]>();
  for (const v of violations) {
    if (!violationsByFile.has(v.file)) violationsByFile.set(v.file, []);
    violationsByFile.get(v.file)!.push(v);
  }

  // file -> cycle participation
  const cycleFiles = new Map<string, number>(); // file -> count of cycles involved
  for (const f of cycleFindings) {
    if (f.file) cycleFiles.set(f.file, (cycleFiles.get(f.file) ?? 0) + 1);
  }

  const hotspots: Hotspot[] = [];

  for (const file of files) {
    const coupling = couplingScores.get(file);
    // Weight fan_in higher — being widely imported is a stronger hotspot signal
    const weightedCoupling = coupling ? (coupling.fan_in * 1.5 + coupling.fan_out) : 0;
    const maxWeightedCoupling = Math.max(
      0,
      ...[...couplingScores.values()].map((c) => c.fan_in * 1.5 + c.fan_out)
    );
    const couplingScore = maxWeightedCoupling > 0 ? Math.min(1, weightedCoupling / maxWeightedCoupling) : 0;

    const fileComplexity = complexityScores.find((c) => c.file === file);
    const complexityScore = normalize(fileComplexity?.loc ?? 0, Math.max(0, ...complexityScores.map(c => c.loc)));

    const fileViolations = violationsByFile.get(file) ?? [];
    const violationPenalty = fileViolations.length * 0.2;

    const isGodObject = godObjects.has(file);
    const godObjectBonus = isGodObject ? 0.30 : 0;

    const cyclesInvolved = (cycleFilesFromPaths.get(file) ?? 0) + (cycleFiles.get(file) ?? 0);
    const cyclePenalty = Math.min(0.50, cyclesInvolved * 0.35);

    const hasSignal =
      (coupling && (coupling.fan_in > 0 || coupling.fan_out > 0)) ||
      (fileComplexity?.loc ?? 0) > 0 ||
      fileViolations.length > 0 ||
      isGodObject ||
      cyclesInvolved > 0;

    if (!hasSignal) continue;

    // Method count signal: files with many methods are hotspots
    const methodCount = graph.nodes.filter(
      (n) => n.kind === "method" && n.file === file
    ).length;
    const maxMethodCount = Math.max(
      1,
      ...[...files].map((f) => graph.nodes.filter((n) => n.kind === "method" && n.file === f).length)
    );
    const methodScore = methodCount / maxMethodCount;

    // Foundational layer boost: repository files are always high-risk foundational layer
    const isRepository = file.includes("/repositories/") || file.includes("/repository/") || file.toLowerCase().includes("repository");
    const isFoundational = isRepository && methodCount >= 3 && (coupling?.fan_in ?? 0) >= 1;
    const foundationalBonus = isFoundational ? 0.25 : 0;

    const rawScore =
      couplingScore * 0.40 +
      complexityScore * 0.15 +
      methodScore * 0.10 +
      violationPenalty +
      godObjectBonus +
      cyclePenalty +
      foundationalBonus;

    const finalScore = Math.min(1.0, rawScore);

    const reasons: { type: HotspotReasonType; detail: string }[] = [];
    if (coupling && couplingScore > 0) {
      reasons.push({
        type: "high_coupling",
        detail: `fan_in=${coupling.fan_in}, fan_out=${coupling.fan_out}`,
      });
    }
    if ((fileComplexity?.loc ?? 0) > 0 && complexityScore > 0) {
      reasons.push({ type: "high_complexity", detail: `max_loc=${fileComplexity?.loc ?? 0}` });
    }
    if (isGodObject) {
      reasons.push({ type: "god_object", detail: "node_count>20 and fan_in>15" });
    }
    if (cyclesInvolved > 0) {
      reasons.push({
        type: "circular_dependency",
        detail: `involved in ${cyclesInvolved} cycle(s)`,
      });
    }

    if (reasons.length === 0) continue;

    hotspots.push({
      id: randomUUID(),
      path: file,
      score: finalScore,
      risk_level: riskLevel(finalScore),
      reasons,
      affected_symbols: affectedSymbolsByFile.get(file) ?? [],
      change_frequency: 0, // OQ-E2: git blame not read — default 0 per spec
    });
  }

  // Dedup: keep highest score per canonical file path (normalize separators)
  const deduped = new Map<string, Hotspot>();
  for (const h of hotspots) {
    const key = h.path.replace(/\\/g, "/");
    const existing = deduped.get(key);
    if (!existing || h.score > existing.score) {
      h.path = key; // normalize path in-place
      deduped.set(key, h);
    }
  }

  return [...deduped.values()]
    .filter(h => !h.path.endsWith("/index.ts")) // suppress barrel files
    .sort((a, b) => b.score - a.score);
}
