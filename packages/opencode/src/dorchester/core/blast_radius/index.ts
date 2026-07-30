// engine/core/blast_radius/index.ts
// Blast Radius Engine — Main Entry Point
// blast_radius_engine.md §1 Mission + §5 Internal Workflow + §9 Interface Contract
// Constitution Rule 3: Deterministic Before AI — pure graph traversal, no estimation.
// Constitution Rule 7: Communicates via MahadataStore only.

import type { MahadataStore, BlastRadiusEntry, DependencyGraph } from "../../contracts/index.js";
import { createLogger } from "../../shared/logger/index.js";
import { selectTriggerCandidates } from "./triggerSelector.js";
import { computeImpactForTrigger } from "./impactCalculator.js";
import { aggregateModuleImpact, aggregateServiceImpact } from "./moduleServiceAggregator.js";
import { classifyApiImpact } from "./apiImpactClassifier.js";
import { calculateRiskScore } from "./riskScoreCalculator.js";

const logger = createLogger("blast_radius");

export interface BlastRadiusResult {
  status: "success" | "partial" | "failed";
  triggers_processed: number;
  total_blast_radius_entries: number;
  duration_ms: number;
  errors: string[];
}

/**
 * BlastRadiusEngine.run() — blast_radius_engine.md §9
 * Reads dependency_graph, hotspots, project_topology (+ optional findings,
 * file_index). Writes mahadata.blast_radius. Does not read repository
 * directly (Constitution Rule 7).
 */
export async function runBlastRadiusEngine(store: MahadataStore): Promise<BlastRadiusResult> {
  const start = Date.now();
  const errors: string[] = [];
  const scanId = store.getMeta().scan_id;
  const log = logger.child({ scan_id: scanId });

  log.info({ event: "blast_radius.start" }, "Blast Radius Engine started");

  const graph: DependencyGraph = store.getDependencyGraph();

  if (graph.nodes.length === 0) {
    log.warn({ event: "blast_radius_no_graph" }, "dependency_graph empty");
    store.setBlastRadius([]);
    return {
      status: "success",
      triggers_processed: 0,
      total_blast_radius_entries: 0,
      duration_ms: Date.now() - start,
      errors,
    };
  }

  let hotspots = [] as ReturnType<typeof store.getHotspots>;
  try {
    hotspots = store.getHotspots();
  } catch {
    // §8: hotspots empty -> use all entry_points as trigger candidates instead
  }

  let topology = null as ReturnType<typeof store.getProjectTopology> | null;
  try {
    topology = store.getProjectTopology();
  } catch {
    topology = null; // §8: skip service impact aggregation
  }

  let findings = [] as ReturnType<typeof store.getFindings>;
  try {
    findings = store.getFindings();
  } catch {
    findings = [];
  }

  let fileIndex = [] as ReturnType<typeof store.getFileIndex>;
  try {
    fileIndex = store.getFileIndex();
  } catch {
    fileIndex = [];
  }

  // ── Step 1: Trigger Selection ───────────────────────────
  const triggers = selectTriggerCandidates(hotspots, topology, graph, findings);

  if (triggers.length === 0) {
    log.info({ event: "blast_radius.no_triggers" }, "No trigger candidates found");
    store.setBlastRadius([]);
    return {
      status: "success",
      triggers_processed: 0,
      total_blast_radius_entries: 0,
      duration_ms: Date.now() - start,
      errors,
    };
  }

  const hotspotByFile = new Map(hotspots.map((h) => [h.path, h]));
  const interfaceExportFiles = new Set(
    graph.nodes
      .filter((n) => n.is_exported && (n.kind === "interface" || n.kind === "type_alias"))
      .map((n) => n.file),
  );

  const totalModules = topology?.modules.filter((m) => m.type !== "service").length || new Set(fileIndex.map((f) => f.module).filter(Boolean)).size;
  const totalServices = topology?.modules.filter((m) => m.type === "service").length ?? 0;

  const entries: BlastRadiusEntry[] = [];

  for (const trigger of triggers) {
    // ── Step 2+3: Direct + Transitive Impact ───────────────
    const impacts = computeImpactForTrigger(trigger.file, graph);

    if (impacts.length === 0 && !graph.nodes.some((n) => n.file === trigger.file)) {
      // trigger not in graph -> skip per §8 error handling
      log.warn(
        { event: "blast_radius.trigger_not_in_graph", trigger_file: trigger.file },
        "Trigger file not found in dependency_graph",
      );
      continue;
    }

    // ── Step 4: Module Impact ──────────────────────────────
    const moduleImpacts = aggregateModuleImpact(impacts, fileIndex);

    // ── Step 5: Service Impact ─────────────────────────────
    const serviceImpacts = aggregateServiceImpact(impacts, topology, fileIndex);

    // ── Step 6: API Impact ─────────────────────────────────
    const apiImpacts = classifyApiImpact(
      trigger.file,
      interfaceExportFiles.has(trigger.file),
      impacts,
      fileIndex,
      graph,
    );

    // ── Step 7: Risk Score ──────────────────────────────────
    const hotspot = hotspotByFile.get(trigger.file);
    const riskScore = calculateRiskScore({
      hotspotScore: hotspot ? hotspot.score : null,
      totalAffectedFiles: impacts.length,
      totalModules,
      moduleImpacts,
      totalServices,
      serviceImpacts,
      apiImpacts,
    });

    entries.push({
      trigger_file: trigger.file,
      trigger_type: trigger.trigger_type,
      impact: {
        files: impacts,
        modules: moduleImpacts,
        services: serviceImpacts,
        apis: apiImpacts,
      },
      total_affected_files: impacts.length,
      total_affected_modules: moduleImpacts.length,
      risk_score: riskScore,
    });
  }

  store.setBlastRadius(entries);

  const duration = Date.now() - start;
  log.info(
    {
      event: "blast_radius.complete",
      triggers_processed: triggers.length,
      total_blast_radius_entries: entries.length,
      duration_ms: duration,
    },
    "Blast Radius Engine complete",
  );

  return {
    status: "success",
    triggers_processed: triggers.length,
    total_blast_radius_entries: entries.length,
    duration_ms: duration,
    errors,
  };
}
