// engine/core/mahadata/executionBriefBuilder.ts
// Mahadata Generator — Step 5: Executive Brief Builder
// mahadata_generator.md §5 Step 5 + §7 Executive Brief Content Rules
// Constitution Rule 3: Pure deterministic. Constraints are DERIVED, never free-form.
//
// NOTE: character-length truncation caps removed by design. The brief is
// consumed by the caller's LLM, not rendered to a human UI — content should
// be as complete as the underlying analysis supports. Selection (top-N,
// relevance ranking) is still used to keep the payload *relevant*, but text
// fields are never mid-thought-truncated.

import type {
  ExecutionBrief,
  ExecutionOrder,
  ProjectTopology,
  Repository,
  DependencyGraph,
  ThreatMatrix,
} from "../../contracts/index.js";
import type { RankedHotspot, RankedCorrelation } from "./relevanceRanker.js";

/**
 * Build the ExecutionBrief — primary input for the configured LLM.
 *
 * @param tokenBudgetEstimate  Pass 0 on first call; caller sets final value after token calc.
 */
export function buildExecutionBrief(
  objective: string,
  repository: Repository,
  topology: ProjectTopology,
  graph: DependencyGraph,
  rankedHotspots: RankedHotspot[],
  rankedCorrelations: RankedCorrelation[],
  executionOrder: ExecutionOrder,
  threatMatrix: ThreatMatrix,
  tokenBudgetEstimate: number,
): ExecutionBrief {
  // ── repository_summary — full detail, no character cap ──
  const topModules = topology.modules
    .map((m) => m.name)
    .join(", ");
  const entryPointPaths = topology.entry_points
    .map((e) => e.path)
    .join(", ");
  const repository_summary =
    `${topology.type} project, primarily ${repository.primary_language}. ` +
    `${repository.total_files} files, ${repository.total_loc} LOC. ` +
    `${topology.modules.length} modules: ${topModules || "none"}. ` +
    `Entry points: ${entryPointPaths || "none"}.`;

  // ── critical_context — priority order §7, no item cap ───
  const critical_context: ExecutionBrief["critical_context"] = [];

  // Priority 1: Circular dependencies
  if (graph.stats.cycles_detected) {
    critical_context.push({
      key: "circular_dependencies",
      value: `${graph.stats.cycle_paths.length} circular dependency cycle(s) detected`,
    });
  }

  // Priority 2: Execution blockers
  const blockedTasks = executionOrder.tasks.filter((t) => t.is_blocked);
  if (blockedTasks.length > 0) {
    const sample = blockedTasks
      .map((t) => t.blocked_by ?? "unknown")
      .join("; ");
    critical_context.push({
      key: "execution_blockers",
      value: `${blockedTasks.length} task(s) blocked: ${sample}`,
    });
  }

  // Priority 3: Critical-level threat categories
  const criticalCategories = (
    Object.entries(threatMatrix.categories) as [string, { level: string }][]
  )
    .filter(([, cat]) => cat.level === "critical")
    .map(([name]) => name);
  if (criticalCategories.length > 0) {
    critical_context.push({
      key: "critical_threats",
      value: criticalCategories.join(", "),
    });
  }

  // Priority 4: Ranked hotspots (relevance-ranked, not truncated)
  for (const rh of rankedHotspots) {
    critical_context.push({
      key: `hotspot:${rh.hotspot.path}`,
      value: `score=${rh.hotspot.score.toFixed(2)}, risk=${rh.hotspot.risk_level}`,
    });
  }

  // Priority 5: Root-cause correlations with confidence ≥ 0.85
  for (const rc of rankedCorrelations.filter((r) => r.correlation.confidence >= 0.85)) {
    critical_context.push({
      key: `correlation:${rc.correlation.id}`,
      value: rc.correlation.consolidated_title,
    });
  }

  // ── priority_hotspots — relevance-ranked, full detail ───
  const priority_hotspots = rankedHotspots.map((rh) => ({
    path: rh.hotspot.path,
    why_relevant: rh.hotspot.reasons
      .map((r) => r.detail)
      .join("; "),
  }));

  // ── key_correlations — relevance-ranked, full detail ────
  const key_correlations = rankedCorrelations.map((rc) => ({
    id: rc.correlation.id,
    summary: rc.correlation.consolidated_title,
  }));

  // ── recommended_entry_points from project topology ──────
  const recommended_entry_points = topology.entry_points.map((ep) => ({
    path: ep.path,
    symbol: null,
    reason: `${ep.type} entry point`,
  }));

  // ── constraints — DERIVED ONLY, never free-form (§7) ────
  const constraints: string[] = [];

  // From execution_order.tasks — blocked tasks
  for (const task of blockedTasks) {
    if (task.blocked_by) {
      constraints.push(
        `Do not execute task on '${task.target_file}': ${task.blocked_by}`,
      );
    }
  }

  // From threat_matrix.blockers — passed through as-is (§7)
  for (const blocker of threatMatrix.blockers) {
    constraints.push(blocker.reason);
  }

  // From dependency_graph.cycles_detected (§7)
  if (graph.stats.cycles_detected) {
    constraints.push(
      "Circular dependencies exist — verify import order before modifying affected files",
    );
  }

  return {
    objective,
    repository_summary,
    critical_context,
    priority_hotspots,
    key_correlations,
    recommended_entry_points,
    constraints,
    token_budget_estimate: tokenBudgetEstimate,
  };
}
