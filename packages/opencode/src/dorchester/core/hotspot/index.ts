// engine/core/hotspot/index.ts
// Hotspot Registry — Main Entry Point
// hotspot_registry.md §1 Mission + §5 Internal Workflow + §8 Interface Contract
// Constitution Rule 3: Deterministic Before AI.
// Constitution Rule 7: Communicates via MahadataStore only.

import type { MahadataStore } from "../../contracts/index.js";
import { createLogger } from "../../shared/logger/index.js";
import { computeCouplingScores } from "./couplingScorer.js";
import { computeComplexityScores } from "./complexityScorer.js";
import { detectArchitectureViolations } from "./architectureViolationDetector.js";
import { detectGodObjects } from "./godObjectDetector.js";
import { aggregateHotspots } from "./hotspotScoreAggregator.js";
import {
  buildCouplingFindings,
  buildComplexityFindings,
  buildArchitectureViolationFindings,
} from "./findingWriter.js";

const logger = createLogger("hotspot_registry");

export interface HotspotResult {
  status: "success" | "partial" | "failed";
  hotspots_written: number;
  findings_written: number;
  duration_ms: number;
  errors: string[];
}

/**
 * HotspotRegistry.run() — hotspot_registry.md §8
 * Reads dependency_graph, file_index, findings (+ optional project_topology).
 * Writes mahadata.hotspots + heuristic findings (coupling_issue,
 * complexity_issue, architecture_violation). Does not read repository
 * directly — Mahadata only (Constitution Rule 7).
 */
export async function runHotspotRegistry(store: MahadataStore): Promise<HotspotResult> {
  const start = Date.now();
  const errors: string[] = [];
  const scanId = store.getMeta().scan_id;
  const log = logger.child({ scan_id: scanId });

  log.info({ event: "hotspot_registry.start" }, "Hotspot Registry started");

  // ── Read Inputs ─────────────────────────────────────────
  const graph = store.getDependencyGraph();
  const fileIndex = store.getFileIndex();
  const findings = store.getFindings();

  let topology = null as ReturnType<typeof store.getProjectTopology> | null;
  try {
    topology = store.getProjectTopology();
  } catch {
    topology = null;
  }

  if (graph.nodes.length === 0) {
    log.warn({ event: "hotspot_no_graph" }, "dependency_graph empty — returning no hotspots");
    store.setHotspots([]);
    return {
      status: "success",
      hotspots_written: 0,
      findings_written: 0,
      duration_ms: Date.now() - start,
      errors,
    };
  }

  const fileRole = new Map(fileIndex.map((f) => [f.path, f.role]));

  // ── Step 1: Coupling ─────────────────────────────────────
  const couplingScores = computeCouplingScores(graph);

  // ── Step 2: Complexity (LOC-based; see complexityScorer.ts limitation note)
  const complexityScores = computeComplexityScores(fileIndex);

  // ── Step 3: Architecture Violations ─────────────────────
  const violations = detectArchitectureViolations(graph, topology, fileRole);

  // ── Step 4: God Object Detection ────────────────────────
  const godObjects = detectGodObjects(graph, couplingScores, fileRole);

  // ── Step 5: Circular Dependency Hotspot Marker ──────────
  const cycleFindings = findings.filter(
    (f) => f.type === "circular_dependency" && f.source_component === "deepstrike",
  );

  // ── Affected symbols per file (for hotspot.affected_symbols) ──
  const affectedSymbolsByFile = new Map<string, string[]>();
  for (const node of graph.nodes) {
    if (!affectedSymbolsByFile.has(node.file)) affectedSymbolsByFile.set(node.file, []);
    affectedSymbolsByFile.get(node.file)!.push(node.id);
  }

  // ── All files under consideration ───────────────────────
  const allFiles = new Set<string>([
    ...couplingScores.keys(),
    ...complexityScores.map((c) => c.file),
    ...violations.map((v) => v.file),
    ...godObjects,
    ...cycleFindings.map((f) => f.file),
  ]);

  // ── Step 6: Hotspot Score Aggregator ────────────────────
  const hotspots = aggregateHotspots({
    files: allFiles,
    couplingScores,
    complexityScores,
    violations,
    godObjects,
    cycleFindings,
    affectedSymbolsByFile,
    cyclePaths: graph.stats.cycle_paths ?? [],
    graph,
  });

  // ── Step 7: Finding Writer (heuristic findings only) ────
  const couplingFindings = buildCouplingFindings(couplingScores.values(), graph.nodes);
  const complexityFindings = buildComplexityFindings(complexityScores);
  const violationFindings = buildArchitectureViolationFindings(violations);

  const heuristicFindings = [
    ...couplingFindings,
    ...complexityFindings,
    ...violationFindings,
  ];

  // ── Write ────────────────────────────────────────────────
  store.setHotspots(hotspots);
  if (heuristicFindings.length > 0) {
    store.addFindings(heuristicFindings);
  }

  const duration = Date.now() - start;
  log.info(
    {
      event: "hotspot_registry.complete",
      hotspots_written: hotspots.length,
      findings_written: heuristicFindings.length,
      duration_ms: duration,
    },
    "Hotspot Registry complete",
  );

  return {
    status: "success",
    hotspots_written: hotspots.length,
    findings_written: heuristicFindings.length,
    duration_ms: duration,
    errors,
  };
}
