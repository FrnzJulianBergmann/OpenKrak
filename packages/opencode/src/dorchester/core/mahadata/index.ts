// engine/core/mahadata/index.ts
// Mahadata Generator — Main Entry Point
// mahadata_generator.md §1 Mission + §5 Internal Workflow + §11 Interface Contract
// Constitution Rule 4: Mahadata is Executable Intelligence.
// Constitution Rule 7: All intelligence flows through Mahadata.
// Constitution Rule 3: Pure deterministic. No AI calls.
//
// NOTE: forced trimming/compression removed by design. token_budget_estimate
// is still computed and stamped onto the brief so the caller (and the
// caller's LLM) knows roughly how large the payload is — but it is never
// used to silently cut hotspots, correlations, or truncate summaries.
// The brief is data for an LLM, not a UI string; completeness beats
// brevity here.

import type { MahadataStore, ExecutionBrief } from "../../contracts/index.js";
import { createLogger } from "../../shared/logger/index.js";
import { analyzeObjective } from "./objectiveAnalyzer.js";
import { rankHotspots, rankCorrelations } from "./relevanceRanker.js";
import { buildThreatMatrix } from "./threatMatrixBuilder.js";
import { buildExecutionBrief } from "./executionBriefBuilder.js";

const logger = createLogger("mahadata_generator");

export interface GenerationResult {
  status: "complete" | "partial" | "failed";
  token_estimate: number;
  duration_ms: number;
  validation_errors: string[];
}

/**
 * runMahadataGenerator() — mahadata_generator.md §11
 *
 * Reads ALL Mahadata fields from store.
 * Writes: execution_brief, threat_matrix, finalizes meta.
 * Must run LAST — after all other components complete.
 * Does NOT return intelligence — all via MahadataStore (Constitution Rule 7).
 */
export async function runMahadataGenerator(
  store: MahadataStore,
  userObjective: string,
): Promise<GenerationResult> {
  const start = Date.now();
  const scanId = store.getMeta().scan_id;
  const log = logger.child({ scan_id: scanId });
  const validationErrors: string[] = [];

  log.info(
    { event: "mahadata_generator.start", objective: userObjective },
    "Mahadata Generator started",
  );

  // ── Step 1: Completeness Validator ─────────────────────
  // Required fields per mahadata_generator.md §3
  // All declared as undefined first, populated via try/catch
  let repoData:           ReturnType<MahadataStore["getRepository"]>      | undefined;
  let topologyData:       ReturnType<MahadataStore["getProjectTopology"]> | undefined;
  let graphData:          ReturnType<MahadataStore["getDependencyGraph"]> | undefined;
  let fileIndexData:      ReturnType<MahadataStore["getFileIndex"]>       | undefined;
  let findingsData:       ReturnType<MahadataStore["getFindings"]>        | undefined;
  let correlationsData:   ReturnType<MahadataStore["getCorrelations"]>    | undefined;
  let hotspotsData:       ReturnType<MahadataStore["getHotspots"]>        | undefined;
  let blastRadiusData:    ReturnType<MahadataStore["getBlastRadius"]>     | undefined;
  let executionOrderData: ReturnType<MahadataStore["getExecutionOrder"]>  | undefined;

  // Required inputs — missing → push validation error + stay undefined
  try { repoData = store.getRepository(); }
  catch { validationErrors.push("missing: repository"); }

  try { topologyData = store.getProjectTopology(); }
  catch { validationErrors.push("missing: project_topology"); }

  try { graphData = store.getDependencyGraph(); }
  catch { validationErrors.push("missing: dependency_graph"); }

  try { fileIndexData = store.getFileIndex(); }
  catch { validationErrors.push("missing: file_index"); }

  try { findingsData = store.getFindings(); }
  catch { validationErrors.push("missing: findings"); }

  try { correlationsData = store.getCorrelations(); }
  catch { validationErrors.push("missing: correlations"); }

  // Highly recommended — missing → warn only, no validation error
  try { hotspotsData = store.getHotspots(); }
  catch { log.warn({ event: "hotspots_unavailable" }, "hotspots not set"); }

  try { blastRadiusData = store.getBlastRadius(); }
  catch { log.warn({ event: "blast_radius_unavailable" }, "blast_radius not set"); }

  try { executionOrderData = store.getExecutionOrder(); }
  catch { log.warn({ event: "execution_order_unavailable" }, "execution_order not set"); }

  if (validationErrors.length > 0) {
    log.warn(
      { event: "completeness_fail", errors: validationErrors },
      "Required Mahadata fields missing — proceeding with partial data",
    );
  }

  // ── Safe fallbacks for fields that failed ───────────────
  // Required fields fallback to empty/unknown stubs
  const safeRepo = repoData ?? {
    name: "unknown",
    path: "",
    remote_url: null,
    primary_language: "unknown",
    languages: [],
    framework: null,
    total_files: 0,
    total_loc: 0,
    git: {
      current_branch: null,
      last_commit_hash: null,
      last_commit_at: null,
      is_dirty: false,
    },
  };
  const safeTopology = topologyData ?? {
    type: "unknown" as const,
    entry_points: [],
    layers: [],
    modules: [],
  };
  const safeGraph = graphData ?? {
    nodes: [],
    edges: [],
    stats: {
      total_nodes: 0,
      total_edges: 0,
      max_depth: 0,
      cycles_detected: false,
      cycle_paths: [],
      node_kind_breakdown: {},
      edge_kind_breakdown: {},
    },
  };
  const safeFindings      = findingsData      ?? [];
  const safeCorrelations  = correlationsData  ?? [];
  const safeHotspots      = hotspotsData      ?? [];
  const safeExecutionOrder = executionOrderData ?? {
    is_valid: false,
    validation_errors: ["execution_order_not_set"],
    tasks: [],
  };

  // blastRadiusData is read but not consumed directly by Generator
  // (it is already in store; upstream components wrote it).
  // Declared to satisfy completeness check logging — unused beyond that.
  void blastRadiusData;

  // ── Step 2: Objective Analyzer ─────────────────────────
  const ctx = analyzeObjective(userObjective);
  log.info(
    { event: "objective_analyzed", task_type: ctx.task_type, scope: ctx.scope },
    "Objective analyzed",
  );

  // ── Step 3: Relevance Ranker ────────────────────────────
  // Ranking is retained — it orders findings by relevance to the objective,
  // it does not drop anything. Nothing here truncates the result set.
  const rankedHotspots     = rankHotspots(safeHotspots, ctx);
  const rankedCorrelations = rankCorrelations(safeCorrelations, ctx);

  // ── Step 4: Threat Matrix Builder ──────────────────────
  // hotspots passed for god_object escalation (Commander Decision P3, 2026-06-19)
  const threatMatrix = buildThreatMatrix(safeFindings, safeHotspots);
  store.setThreatMatrix(threatMatrix);
  log.info({ event: "threat_matrix_built" }, "Threat matrix built");

  // ── Step 5: Executive Brief Builder — full detail, no trim passes ──
  let brief = buildExecutionBrief(
    userObjective,
    safeRepo,
    safeTopology,
    safeGraph,
    rankedHotspots,
    rankedCorrelations,
    safeExecutionOrder,
    threatMatrix,
    0,
  );

  // ── Step 6: Token estimate — informational only ────────
  // Formula: char count × 0.25 — mahadata_schema.md §4.11.1
  // This number is reported to the caller/orchestrator so it can plan
  // context usage; it is NOT used here to cut or compress content.
  const estimatedTokens = estimateTokens(brief);
  brief = { ...brief, token_budget_estimate: estimatedTokens };

  store.setExecutionBrief(brief);
  log.info(
    { event: "execution_brief_built", token_estimate: estimatedTokens },
    "Execution brief built",
  );

  // ── Step 7: Final Validator + Meta Finalization ─────────
  // "complete" only if all required fields were present
  const finalStatus: "complete" | "partial" =
    validationErrors.length > 0 ? "partial" : "complete";

  store.finalizeMeta(
    finalStatus,
    validationErrors.length > 0 ? validationErrors.join("; ") : undefined,
  );

  const duration = Date.now() - start;
  log.info(
    {
      event: "mahadata_generator.complete",
      status: finalStatus,
      token_estimate: estimatedTokens,
      duration_ms: duration,
    },
    "Mahadata Generator complete",
  );

  return {
    status: finalStatus,
    token_estimate: estimatedTokens,
    duration_ms: duration,
    validation_errors: validationErrors,
  };
}

/**
 * Token estimation: JSON char count × 0.25.
 * mahadata_schema.md §4.11.1 — advisory estimate for the orchestrator.
 * Informational only — see note at top of file.
 */
function estimateTokens(brief: ExecutionBrief): number {
  return Math.ceil(JSON.stringify(brief).length * 0.25);
}
