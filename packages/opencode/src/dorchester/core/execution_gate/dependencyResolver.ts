// engine/core/execution_gate/dependencyResolver.ts
// Execution Gate — Step 2: Task Dependency Resolver
// execution_gate.md §5 Step 2
// Constitution Rule 3: Pure deterministic. No AI.

import type { Correlation, DependencyGraph, Finding } from "../../contracts/index.js";
import type { RawTask } from "./taskExtractor.js";

/**
 * Determine task dependencies:
 * - Root cause task must come before related finding tasks
 * - File A modified before File B if A→B in dependency_graph
 */
export function resolveTaskDependencies(
  tasks: RawTask[],
  correlations: Correlation[],
  findings: Finding[],
  graph: DependencyGraph,
): Map<string, string[]> {
  // task_id → [depends_on task_id[]]
  const depMap = new Map<string, string[]>();
  for (const t of tasks) depMap.set(t.task_id, []);

  // Build: finding_id → task_id (for correlation tasks)
  const findingToTask = new Map<string, string>();
  for (const t of tasks) {
    if (t.source === "correlation" && t.target_file.startsWith("finding:")) {
      const fid = t.target_file.replace("finding:", "");
      findingToTask.set(fid, t.task_id);
    }
  }

  // Rule: root_cause task → all its related finding tasks
  for (const corr of correlations) {
    if (corr.type !== "root_cause") continue;
    const rootTaskId = findingToTask.get(corr.root_finding_id);
    if (!rootTaskId) continue;
    for (const relId of corr.related_finding_ids) {
      const relTaskId = findingToTask.get(relId);
      if (relTaskId && relTaskId !== rootTaskId) {
        depMap.get(relTaskId)!.push(rootTaskId);
      }
    }
  }

  // Rule: impact chain ordering — step N depends on step N-1
  for (const corr of correlations) {
    const stepsOrdered = [...corr.impact_chain].sort((a, b) => a.step - b.step);
    for (let i = 1; i < stepsOrdered.length; i++) {
      const prevTaskId = findingToTask.get(stepsOrdered[i - 1].finding_id);
      const currTaskId = findingToTask.get(stepsOrdered[i].finding_id);
      if (prevTaskId && currTaskId && prevTaskId !== currTaskId) {
        const deps = depMap.get(currTaskId)!;
        if (!deps.includes(prevTaskId)) deps.push(prevTaskId);
      }
    }
  }

  return depMap;
}
