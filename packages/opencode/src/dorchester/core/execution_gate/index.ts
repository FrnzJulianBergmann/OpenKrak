// engine/core/execution_gate/index.ts
// Execution Gate — Main Entry Point
// execution_gate.md §1 Mission + §5 Internal Workflow + §8 Interface Contract
// Constitution Rule 3: Deterministic, 100% accuracy required.
// Constitution Rule 7: Writes to MahadataStore only.

import type { MahadataStore, ExecutionTask } from "../../contracts/index.js";
import { createLogger } from "../../shared/logger/index.js";
import { extractTasks } from "./taskExtractor.js";
import { resolveTaskDependencies } from "./dependencyResolver.js";
import { detectTaskCycles } from "./cycleDetector.js";
import { topologicalSort } from "./topologicalSorter.js";
import { runSafetyChecks } from "./safetyChecker.js";

const logger = createLogger("execution_gate");

export interface ExecutionGateResult {
  status: "valid" | "partial" | "blocked";
  tasks_total: number;
  tasks_ordered: number;
  tasks_blocked: number;
  validation_errors: string[];
  cycle_detected: boolean;
  duration_ms: number;
}

/**
 * ExecutionGate.run() — execution_gate.md §8
 * Reads from MahadataStore, writes execution_order.
 * Does NOT return data directly — all via Mahadata (Constitution Rule 7).
 */
export async function runExecutionGate(store: MahadataStore): Promise<ExecutionGateResult> {
  const start = Date.now();
  const scanId = store.getMeta().scan_id;
  const log = logger.child({ scan_id: scanId });
  const validationErrors: string[] = [];

  log.info({ event: "execution_gate.start" }, "Execution Gate started");

  // ── Read Inputs ─────────────────────────────────────────
  const correlations = store.getCorrelations();
  const findings = store.getFindings();
  const fileIndex = store.getFileIndex();

  let blastRadius = [] as ReturnType<typeof store.getBlastRadius>;
  try {
    blastRadius = store.getBlastRadius();
  } catch {
    validationErrors.push("blast_radius_unavailable");
    log.warn({ event: "blast_radius_unavailable" }, "blast_radius not set — execution_order marked invalid");
  }

  let hotspots = [] as ReturnType<typeof store.getHotspots>;
  try {
    hotspots = store.getHotspots();
  } catch {
    // optional
  }

  // Blast radius required for is_valid
  const blastRadiusAvailable = blastRadius.length > 0 || validationErrors.length === 0;

  // ── Step 1: Task Extractor ──────────────────────────────
  const rawTasks = extractTasks(correlations, blastRadius);

  if (rawTasks.length === 0) {
    log.info({ event: "execution_gate.empty" }, "No tasks — returning empty execution_order");
    store.setExecutionOrder({ is_valid: true, validation_errors: [], tasks: [] });
    return {
      status: "valid",
      tasks_total: 0,
      tasks_ordered: 0,
      tasks_blocked: 0,
      validation_errors: [],
      cycle_detected: false,
      duration_ms: Date.now() - start,
    };
  }

  // ── Step 2: Dependency Resolver ─────────────────────────
  let graph;
  try {
    graph = store.getDependencyGraph();
  } catch {
    graph = { nodes: [], edges: [], stats: { total_nodes: 0, total_edges: 0, max_depth: 0, cycles_detected: false, cycle_paths: [], node_kind_breakdown: {}, edge_kind_breakdown: {} } };
  }

  const depMap = resolveTaskDependencies(rawTasks, correlations, findings, graph);

  // ── Step 3: Cycle Detector ──────────────────────────────
  const cycleReport = detectTaskCycles(rawTasks, depMap);
  if (cycleReport.hasCycle) {
    validationErrors.push(...cycleReport.validationErrors);
    log.warn({ event: "cycle_detected", errors: cycleReport.validationErrors }, "Task dependency cycles detected");
  }

  // ── Step 4: Topological Sort ────────────────────────────
  const sortedTasks = topologicalSort(rawTasks, depMap, cycleReport.cycleTaskIds);

  // ── Step 5: Safety Checker ──────────────────────────────
  const safetyCheckedTasks = runSafetyChecks(sortedTasks, fileIndex, hotspots, blastRadius);

  const blockedFromSafety = safetyCheckedTasks.filter((t) => t.is_blocked);
  if (blockedFromSafety.length > 0) {
    for (const bt of blockedFromSafety) {
      validationErrors.push(bt.blocked_by ?? "unknown safety check failure");
    }
  }

  // ── Step 6: Assemble ExecutionOrder ─────────────────────
  // Include ALL tasks — including blocked ones (so Mahadata Generator can put in constraints)
  const allTasks: ExecutionTask[] = [];

  // Blocked tasks from cycles
  for (const taskId of cycleReport.cycleTaskIds) {
    const raw = rawTasks.find((t) => t.task_id === taskId);
    if (!raw) continue;
    allTasks.push({
      task_id: raw.task_id,
      order: 0, // no order — blocked
      action: raw.action,
      target_file: raw.target_file,
      depends_on_task_ids: depMap.get(raw.task_id) ?? [],
      blocked_by: `circular_task_dependency`,
      is_blocked: true,
      safety_checks: [],
    });
  }

  // Safety-checked tasks
  for (const checked of safetyCheckedTasks) {
    allTasks.push({
      task_id: checked.sorted.task.task_id,
      order: checked.sorted.order,
      action: checked.sorted.task.action,
      target_file: checked.sorted.task.target_file,
      depends_on_task_ids: depMap.get(checked.sorted.task.task_id) ?? [],
      blocked_by: checked.blocked_by,
      is_blocked: checked.is_blocked,
      safety_checks: checked.safetyChecks,
    });
  }

  // Sort final list by order (blocked tasks last)
  allTasks.sort((a, b) => {
    if (a.is_blocked && !b.is_blocked) return 1;
    if (!a.is_blocked && b.is_blocked) return -1;
    return a.order - b.order;
  });

  const totalBlocked = allTasks.filter((t) => t.is_blocked).length;
  const isValid =
    validationErrors.length === 0 &&
    totalBlocked === 0 &&
    blastRadiusAvailable;

  store.setExecutionOrder({
    is_valid: isValid,
    validation_errors: validationErrors,
    tasks: allTasks,
  });

  const duration = Date.now() - start;
  log.info(
    {
      event: "execution_gate.complete",
      is_valid: isValid,
      tasks_total: allTasks.length,
      tasks_blocked: totalBlocked,
      cycle_detected: cycleReport.hasCycle,
      duration_ms: duration,
    },
    "Execution Gate complete",
  );

  const status =
    totalBlocked === allTasks.length && allTasks.length > 0
      ? "blocked"
      : !isValid
      ? "partial"
      : "valid";

  return {
    status,
    tasks_total: allTasks.length,
    tasks_ordered: allTasks.length - totalBlocked,
    tasks_blocked: totalBlocked,
    validation_errors: validationErrors,
    cycle_detected: cycleReport.hasCycle,
    duration_ms: duration,
  };
}
