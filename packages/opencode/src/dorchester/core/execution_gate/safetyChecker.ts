// engine/core/execution_gate/safetyChecker.ts
// Execution Gate — Step 5: Safety Checker
// execution_gate.md §5 Step 5 + §6 Safety Check Definitions
// Constitution Rule 3: 100% deterministic. All checks must pass.

import type { FileIndexEntry, Hotspot, BlastRadiusEntry } from "../../contracts/index.js";
import type { RawTask } from "./taskExtractor.js";
import type { SortedTask } from "./topologicalSorter.js";

export interface SafetyCheckedTask {
  sorted: SortedTask;
  safetyChecks: { check: string; passed: boolean }[];
  blocked_by: string | null;
  is_blocked: boolean;
}

/**
 * Safety Check Definitions — execution_gate.md §6
 *
 * CHECK-1: target_file in file_index
 * CHECK-2: no two tasks with same target_file running at same order level
 * CHECK-3: tasks touching entry_point must have blast_radius entry
 * CHECK-4: tasks on critical hotspot files must have predecessor that lowers risk
 */
export function runSafetyChecks(
  sortedTasks: SortedTask[],
  fileIndex: FileIndexEntry[],
  hotspots: Hotspot[],
  blastRadius: BlastRadiusEntry[],
): SafetyCheckedTask[] {
  const fileIndexPaths = new Set(fileIndex.map((f) => f.path));
  const entryPointFiles = new Set(fileIndex.filter((f) => f.is_entry_point).map((f) => f.path));
  const blastRadiusFiles = new Set(blastRadius.map((b) => b.trigger_file));

  const criticalHotspotFiles = new Set(
    hotspots.filter((h) => h.risk_level === "critical").map((h) => h.path),
  );

  // Track files per order level for CHECK-2
  const orderFileMap = new Map<number, Set<string>>();
  for (const st of sortedTasks) {
    if (!orderFileMap.has(st.order)) orderFileMap.set(st.order, new Set());
    orderFileMap.get(st.order)!.add(st.task.target_file);
  }

  // Track which critical files have been addressed by prior tasks
  const addressedCriticalFiles = new Set<string>();

  const results: SafetyCheckedTask[] = [];

  for (const sorted of sortedTasks) {
    const { task, order } = sorted;
    const checks: { check: string; passed: boolean }[] = [];
    const failures: string[] = [];

    // Resolve actual file path from target_file ref
    const actualFile = task.target_file.startsWith("file:")
      ? task.target_file.replace("file:", "")
      : task.target_file.startsWith("finding:")
      ? null // finding-ref tasks don't have a direct file for CHECK-1
      : task.target_file;

    // CHECK-1: target_file in file_index (only for file: refs)
    if (actualFile !== null) {
      const check1 = fileIndexPaths.has(actualFile);
      checks.push({ check: "CHECK-1:target_file_in_file_index", passed: check1 });
      if (!check1) failures.push(`CHECK-1: target_file '${actualFile}' not in file_index`);
    } else {
      // finding-ref tasks pass CHECK-1 (they are correlation-derived, not file-direct)
      checks.push({ check: "CHECK-1:target_file_in_file_index", passed: true });
    }

    // CHECK-2: no duplicate target_file at same order level
    const filesAtOrder = orderFileMap.get(order) ?? new Set();
    const check2 =
      actualFile === null
        ? true
        : [...filesAtOrder].filter((f) => f === task.target_file).length <= 1;
    checks.push({ check: "CHECK-2:no_parallel_same_file", passed: check2 });
    if (!check2) failures.push(`CHECK-2: task at order ${order} conflicts with another task on same file`);

    // CHECK-3: entry point tasks must have blast_radius entry
    if (actualFile && entryPointFiles.has(actualFile)) {
      const check3 = blastRadiusFiles.has(actualFile);
      checks.push({ check: "CHECK-3:entry_point_needs_blast_radius", passed: check3 });
      if (!check3) failures.push(`CHECK-3: entry_point file '${actualFile}' has no blast_radius entry`);
    } else {
      checks.push({ check: "CHECK-3:entry_point_needs_blast_radius", passed: true });
    }

    // CHECK-4: critical hotspot file must have predecessor addressing risk
    if (actualFile && criticalHotspotFiles.has(actualFile)) {
      const check4 = addressedCriticalFiles.has(actualFile);
      checks.push({ check: "CHECK-4:critical_hotspot_needs_predecessor", passed: check4 });
      if (!check4) failures.push(`CHECK-4: critical hotspot file '${actualFile}' has no risk-addressing predecessor task`);
    } else {
      checks.push({ check: "CHECK-4:critical_hotspot_needs_predecessor", passed: true });
    }

    // After processing, mark this file as "addressed" for downstream tasks
    if (actualFile) addressedCriticalFiles.add(actualFile);

    const blocked = failures.length > 0;
    results.push({
      sorted,
      safetyChecks: checks,
      blocked_by: blocked ? failures.join("; ") : null,
      is_blocked: blocked,
    });
  }

  return results;
}
