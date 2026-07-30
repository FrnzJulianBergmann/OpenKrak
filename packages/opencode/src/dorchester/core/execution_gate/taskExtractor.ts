// engine/core/execution_gate/taskExtractor.ts
// Execution Gate — Step 1: Task Extractor
// execution_gate.md §5 Step 1
// Constitution Rule 3: Pure deterministic. No AI.

import type { Correlation, BlastRadiusEntry, ExecutionTask } from "../../contracts/index.js";
import { randomUUID } from "crypto";

const BLAST_RADIUS_RISK_THRESHOLD = 0.6;

export interface RawTask {
  task_id: string;
  action: string;
  target_file: string;
  source: "correlation" | "blast_radius";
  correlation_root_id?: string;
  risk_score?: number;
}

/**
 * Extract raw tasks from correlations and blast_radius entries.
 * Each correlation root_cause → one or more tasks.
 * Each blast_radius entry with risk_score > threshold → safety-flagged task.
 */
export function extractTasks(
  correlations: Correlation[],
  blastRadius: BlastRadiusEntry[],
): RawTask[] {
  const tasks: RawTask[] = [];
  const seenFiles = new Set<string>(); // dedup by target file

  // From correlations: root_cause type tasks
  for (const corr of correlations) {
    if (corr.type !== "root_cause") continue;
    if (corr.noise_suppressed) continue;

    // We need to know the file — find it from the root finding
    // The root_finding_id is tracked; actual file is sourced from findings
    // But ExecutionGate reads from store — we use the id as action target
    const taskId = randomUUID();
    const targetRef = `finding:${corr.root_finding_id}`;
    if (!seenFiles.has(targetRef)) {
      seenFiles.add(targetRef);
      tasks.push({
        task_id: taskId,
        action: "resolve_finding",
        target_file: targetRef,
        source: "correlation",
        correlation_root_id: corr.root_finding_id,
      });
    }

    // Related findings also become tasks (leaf tasks)
    for (const relId of corr.related_finding_ids) {
      const relRef = `finding:${relId}`;
      if (!seenFiles.has(relRef)) {
        seenFiles.add(relRef);
        tasks.push({
          task_id: randomUUID(),
          action: "resolve_finding",
          target_file: relRef,
          source: "correlation",
          correlation_root_id: corr.root_finding_id,
        });
      }
    }
  }

  // From blast_radius: high-risk file tasks
  for (const entry of blastRadius) {
    if (entry.risk_score < BLAST_RADIUS_RISK_THRESHOLD) continue;
    const ref = `file:${entry.trigger_file}`;
    if (!seenFiles.has(ref)) {
      seenFiles.add(ref);
      tasks.push({
        task_id: randomUUID(),
        action: "review_blast_radius",
        target_file: entry.trigger_file,
        source: "blast_radius",
        risk_score: entry.risk_score,
      });
    }
  }

  return tasks;
}
