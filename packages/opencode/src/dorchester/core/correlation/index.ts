// engine/core/correlation/index.ts
// Correlation Engine — Main Entry Point
// correlation_engine.md §1 Mission + §5 Internal Workflow + §11 Interface Contract
// Constitution Rule 3: Pure deterministic. No AI calls.
// Constitution Rule 7: Writes to MahadataStore only.

import type { MahadataStore, Correlation, Finding } from "../../contracts/index.js";
import { createLogger } from "../../shared/logger/index.js";
import { classifyFindings } from "./findingClassifier.js";
import { createDependencyGraphReader } from "./dependencyPathResolver.js";
import { detectRootCauses } from "./rootCauseDetector.js";
import { buildImpactChains } from "./impactChainBuilder.js";
import { tagNoise } from "./noiseReducer.js";
import { randomUUID } from "crypto";

const logger = createLogger("correlation_engine");

export interface CorrelationResult {
  status: "success" | "partial" | "failed";
  correlations_written: number;
  findings_suppressed: number;
  duration_ms: number;
  errors: string[];
}

/**
 * CorrelationEngine.run() — correlation_engine.md §11
 * Reads from MahadataStore, writes correlations back.
 * Does NOT return data directly — all via Mahadata (Constitution Rule 7).
 */
export async function runCorrelationEngine(store: MahadataStore): Promise<CorrelationResult> {
  const start = Date.now();
  const scanId = store.getMeta().scan_id;
  const log = logger.child({ scan_id: scanId });
  const errors: string[] = [];

  log.info({ event: "correlation_engine.start" }, "Correlation Engine started");

  // ── Read Inputs ─────────────────────────────────────────
  const findings = store.getFindings();
  let graph;
  try {
    graph = store.getDependencyGraph();
  } catch {
    // dependency_graph not available — degraded mode (§10 error handling)
    log.warn(
      { event: "correlation_engine.degraded", reason: "dependency_graph unavailable" },
      "Running in degraded mode — file proximity only",
    );
    // Write standalone correlations for all findings
    const standaloneCorrelations = buildStandaloneCorrelations(findings);
    store.setCorrelations(standaloneCorrelations);
    return {
      status: "partial",
      correlations_written: standaloneCorrelations.length,
      findings_suppressed: 0,
      duration_ms: Date.now() - start,
      errors: ["dependency_graph_unavailable"],
    };
  }

  if (findings.length === 0) {
    log.info({ event: "correlation_engine.empty" }, "No findings — returning empty correlations");
    store.setCorrelations([]);
    return {
      status: "success",
      correlations_written: 0,
      findings_suppressed: 0,
      duration_ms: Date.now() - start,
      errors: [],
    };
  }

  // ── Build hotspot score map (soft dependency) ───────────
  let hotspotScoreByFile = new Map<string, number>();
  try {
    const hotspots = store.getHotspots();
    for (const h of hotspots) {
      hotspotScoreByFile.set(h.path, h.score);
    }
  } catch {
    // hotspots optional — proceed without bonus
  }

  // ── Step 1: Classify findings ───────────────────────────
  const classified = classifyFindings(findings);
  log.info({ event: "step1.classified", count: classified.length }, "Findings classified");

  // ── Step 2: Build DependencyGraphReader ─────────────────
  const reader = createDependencyGraphReader(graph);

  // ── Step 3: Root Cause Detection ────────────────────────
  const rootCandidates = detectRootCauses(classified, reader, hotspotScoreByFile);
  log.info(
    { event: "step3.root_causes", count: rootCandidates.length },
    "Root cause candidates found",
  );

  // ── Step 4: Impact Chain Builder ────────────────────────
  const chains = buildImpactChains(rootCandidates);
  log.info({ event: "step4.chains", count: chains.length }, "Impact chains built");

  // ── Step 5: Noise Reducer ───────────────────────────────
  const tagged = tagNoise(findings, chains);
  const suppressedCount = tagged.filter((t) => t.noise_suppressed).length;
  log.info(
    { event: "step5.noise", suppressed: suppressedCount },
    "Noise reduction complete",
  );

  // ── Step 6: Build Correlation objects ──────────────────
  // Track which findings are covered by a chain
  const coveredFindingIds = new Set<string>();

  const correlations: Correlation[] = chains.map((chain) => {
    coveredFindingIds.add(chain.rootFinding.id);
    for (const id of chain.relatedFindingIds) coveredFindingIds.add(id);

    const noiseTag = tagged.find((t) => t.finding.id === chain.rootFinding.id);
    // Chain is suppressed if any related finding is suppressed
    const anyRelatedSuppressed = chain.relatedFindingIds.some(
      (rid) => tagged.find((t) => t.finding.id === rid)?.noise_suppressed
    );
    return {
      id: randomUUID(),
      type: "impact_chain" as const,
      confidence: chain.confidence,
      root_finding_id: chain.rootFinding.id,
      related_finding_ids: chain.relatedFindingIds,
      impact_chain: chain.steps,
      consolidated_title: `Root: ${chain.rootFinding.title}`,
      consolidated_description: chain.rootFinding.description,
      noise_suppressed: noiseTag?.noise_suppressed ?? anyRelatedSuppressed,
      noise_reason: noiseTag?.noise_reason ?? (anyRelatedSuppressed ? "Related findings suppressed" : null),
    };
  });

  // Root cause correlations (one per root finding in chains)
  const rootFindingIds = new Set(chains.map((c) => c.rootFinding.id));
  for (const rf of rootCandidates.filter((c) => rootFindingIds.has(c.rootFinding.id))) {
    if (correlations.some((c) => c.type === "root_cause" && c.root_finding_id === rf.rootFinding.id)) continue;
    const noiseTag = tagged.find((t) => t.finding.id === rf.rootFinding.id);
    correlations.push({
      id: randomUUID(),
      type: "root_cause" as const,
      confidence: rf.confidence,
      root_finding_id: rf.rootFinding.id,
      related_finding_ids: [],
      impact_chain: [],
      consolidated_title: `Root: ${rf.rootFinding.title}`,
      consolidated_description: rf.rootFinding.description,
      noise_suppressed: noiseTag?.noise_suppressed ?? false,
      noise_reason: noiseTag?.noise_reason ?? null,
    });
  }

  // Standalone correlations for uncovered findings
  const uncovered = findings.filter((f) => !coveredFindingIds.has(f.id));
  const standaloneCorrelations = buildStandaloneCorrelations(uncovered, tagged);
  correlations.push(...standaloneCorrelations);

  // Check: if all correlations have low confidence, flag as partial
  const allLowConfidence =
    correlations.length > 0 &&
    correlations.every((c) => c.confidence !== null && c.confidence < 0.6);
  if (allLowConfidence) {
    log.warn({ event: "correlation_engine.low_confidence" }, "All correlations below threshold");
    errors.push("low_confidence_correlations");
  }

  // ── Write to MahadataStore ──────────────────────────────
  store.setCorrelations(correlations);

  const duration = Date.now() - start;
  log.info(
    {
      event: "correlation_engine.complete",
      correlations_written: correlations.length,
      findings_suppressed: suppressedCount,
      duration_ms: duration,
    },
    "Correlation Engine complete",
  );

  return {
    status: errors.length > 0 ? "partial" : "success",
    correlations_written: correlations.length,
    findings_suppressed: suppressedCount,
    duration_ms: duration,
    errors,
  };
}

/** Build standalone correlation for findings not assigned to any chain */
function buildStandaloneCorrelations(findings: Finding[], tagged: { finding: Finding; noise_suppressed: boolean; noise_reason: string | null }[] = []): Correlation[] {
  const taggedMap = new Map(tagged.map(t => [t.finding.id, t]));
  return findings.map((f) => {
    const tag = taggedMap.get(f.id);
    const noise_suppressed = tag?.noise_suppressed ?? false;
    return {
      id: randomUUID(),
      type: "root_cause" as const,
      confidence: 1.0,
      root_finding_id: f.id,
      related_finding_ids: [],
      impact_chain: [],
      consolidated_title: f.title,
      consolidated_description: f.description,
      noise_suppressed,
      noise_reason: tag?.noise_reason ?? null,
    };
  });
}
