// engine/action_layer/safetyChecker.ts
// Action Layer — Universal Safety Checks
// action_layer.md §4.3

import path from "node:path";
import type { PlannedAction } from "../action_contracts/index.js";
import type { ActionResult, SafetyCheckResult, SafetyFailure } from "./types.js";

export function resolveSafePath(targetPath: string, repoRoot: string): string {
  const abs = path.isAbsolute(targetPath) ? targetPath : path.join(repoRoot, targetPath);
  const resolved = path.normalize(abs);
  const normalizedRoot = path.normalize(repoRoot);

  if (!resolved.startsWith(normalizedRoot)) {
    throw new Error(`path_in_repo_root violation: ${targetPath} escapes repo_root`);
  }
  if (resolved.split(path.sep).includes(".git")) {
    throw new Error(`no_git_dir_write violation: ${targetPath} targets .git/`);
  }
  return resolved;
}

export function runUniversalSafetyChecks(
  action: PlannedAction,
  repoRoot: string,
  completedResults: Map<string, ActionResult>,
): SafetyCheckResult {
  const failures: SafetyFailure[] = [];

  // path_in_repo_root + no_git_dir_write (only applicable if target looks like a path)
  try {
    if (action.target && !action.target.includes("://")) {
      resolveSafePath(action.target, repoRoot);
    }
  } catch (err) {
    failures.push({
      check: (err as Error).message.startsWith("no_git_dir_write") ? "no_git_dir_write" : "path_in_repo_root",
      reason: (err as Error).message,
      fatal: true,
    });
  }

  // depends_on_completed
  for (const dep of action.depends_on) {
    const result = completedResults.get(dep);
    if (!result || (result.status !== "success" && result.status !== "dry_run")) {
      failures.push({
        check: "depends_on_completed",
        reason: `Dependency ${dep} has not completed successfully`,
        fatal: true,
      });
    }
  }

  // risk_level_acknowledged — critical actions require explicit ack in parameters
  if (action.risk_level === "critical") {
    const params = action.parameters as Record<string, unknown>;
    if (params?.risk_acknowledged !== true) {
      failures.push({
        check: "risk_level_acknowledged",
        reason: "Critical risk action requires risk_acknowledged: true",
        fatal: true,
      });
    }
  }

  return { safe: failures.every((f) => !f.fatal), failures };
}
