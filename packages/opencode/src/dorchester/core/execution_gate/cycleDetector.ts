// engine/core/execution_gate/cycleDetector.ts
// Execution Gate — Step 3: Cycle Detector (Task Graph)
// execution_gate.md §5 Step 3
// Constitution Rule 3: 100% deterministic. Zero tolerance for missed cycles.

import type { RawTask } from "./taskExtractor.js";

export interface CycleReport {
  hasCycle: boolean;
  cycleTaskIds: Set<string>;
  validationErrors: string[];
}

/**
 * DFS-based cycle detection on the task dependency graph.
 * Any task involved in a cycle is flagged is_blocked: true
 * per execution_gate.md §5 Step 3.
 */
export function detectTaskCycles(
  tasks: RawTask[],
  depMap: Map<string, string[]>,
): CycleReport {
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const cycleTaskIds = new Set<string>();
  const validationErrors: string[] = [];

  function dfs(taskId: string, path: string[]): void {
    visited.add(taskId);
    inStack.add(taskId);

    for (const dep of depMap.get(taskId) ?? []) {
      if (!visited.has(dep)) {
        dfs(dep, [...path, taskId]);
      } else if (inStack.has(dep)) {
        // Cycle found — mark all tasks in cycle
        const cycleStart = path.indexOf(dep);
        const cyclePath = cycleStart >= 0 ? path.slice(cycleStart) : [dep, taskId];
        for (const id of cyclePath) cycleTaskIds.add(id);
        cycleTaskIds.add(taskId);
        cycleTaskIds.add(dep);
        validationErrors.push(
          `CIRCULAR_DEPENDENCY`,
        );
      }
    }

    inStack.delete(taskId);
  }

  for (const task of tasks) {
    if (!visited.has(task.task_id)) {
      dfs(task.task_id, []);
    }
  }

  return {
    hasCycle: cycleTaskIds.size > 0,
    cycleTaskIds,
    validationErrors,
  };
}
