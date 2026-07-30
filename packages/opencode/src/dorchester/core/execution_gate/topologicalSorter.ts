// engine/core/execution_gate/topologicalSorter.ts
// Execution Gate — Step 4: Topological Sorter (Kahn's Algorithm)
// execution_gate.md §5 Step 4 + §7 Tie-Breaking & Determinism Rules
// Constitution Rule 3: 100% deterministic. Same input → same output.

import type { RawTask } from "./taskExtractor.js";

export interface SortedTask {
  task: RawTask;
  order: number; // 1-based
}

/**
 * Kahn's algorithm on task dependency graph.
 * Tie-breaking rule (§7): alphabetical by target_file, then by action string.
 * This guarantees determinism — identical input → identical output.
 */
export function topologicalSort(
  tasks: RawTask[],
  depMap: Map<string, string[]>,
  blockedTaskIds: Set<string>,
): SortedTask[] {
  // Exclude blocked tasks from sort
  const activeTasks = tasks.filter((t) => !blockedTaskIds.has(t.task_id));

  // Build in-degree map (only active tasks)
  const inDegree = new Map<string, number>();
  const activeIds = new Set(activeTasks.map((t) => t.task_id));

  for (const t of activeTasks) inDegree.set(t.task_id, 0);

  for (const [taskId, deps] of depMap) {
    if (!activeIds.has(taskId)) continue;
    for (const dep of deps) {
      if (activeIds.has(dep)) {
        inDegree.set(taskId, (inDegree.get(taskId) ?? 0) + 1);
      }
    }
  }

  // Build reverse map: dep → [tasks that depend on dep]
  const reverseMap = new Map<string, string[]>();
  for (const [taskId, deps] of depMap) {
    if (!activeIds.has(taskId)) continue;
    for (const dep of deps) {
      if (!activeIds.has(dep)) continue;
      if (!reverseMap.has(dep)) reverseMap.set(dep, []);
      reverseMap.get(dep)!.push(taskId);
    }
  }

  // Initial queue: tasks with in-degree 0
  const taskById = new Map(activeTasks.map((t) => [t.task_id, t]));

  let queue = activeTasks
    .filter((t) => (inDegree.get(t.task_id) ?? 0) === 0)
    .sort(tieBreakerSort);

  const result: SortedTask[] = [];
  let order = 1;

  while (queue.length > 0) {
    const task = queue.shift()!;
    result.push({ task, order: order++ });

    // Reduce in-degree for dependents
    const nextCandidates: RawTask[] = [];
    for (const dependentId of reverseMap.get(task.task_id) ?? []) {
      const newDegree = (inDegree.get(dependentId) ?? 1) - 1;
      inDegree.set(dependentId, newDegree);
      if (newDegree === 0) {
        const dep = taskById.get(dependentId);
        if (dep) nextCandidates.push(dep);
      }
    }
    // Re-insert in tie-breaker order
    queue = [...queue, ...nextCandidates].sort(tieBreakerSort);
  }

  return result;
}

/**
 * Tie-breaking: target_file alphabetical ascending, then action alphabetical
 * execution_gate.md §7
 */
function tieBreakerSort(a: RawTask, b: RawTask): number {
  const fileComp = a.target_file.localeCompare(b.target_file);
  if (fileComp !== 0) return fileComp;
  return a.action.localeCompare(b.action);
}
