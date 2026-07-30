// engine/action_layer/index.ts
// Action Layer — Main Entry Point
// action_layer.md §1, §4.1, §8, §12 Phase Gate
// ⚠️ Risk level TERTINGGI di seluruh sistem. Default dry_run wajib true (C-02).

import { createLogger } from "../shared/logger/index.js";
import { ActionLayerConfigError } from "./types.js";
import { ExecutionEngine } from "./executionEngine.js";
import { FileWriteEffector, FileDeleteEffector, FileRenameEffector } from "./effectors/fileEffector.js";
import { GitCommitEffector, GitBranchEffector, GitPushEffector } from "./effectors/gitEffector.js";
import { DbQueryEffector, type DbEffectorDeps } from "./effectors/dbEffector.js";
import { TestRunEffector } from "./effectors/testEffector.js";
import { CiTriggerEffector } from "./effectors/ciEffector.js";
import { ShellCommandEffector } from "./effectors/shellEffector.js";
import type { Effector, ActionLayerInput, ActionLayerReport } from "./types.js";

const logger = createLogger("action_layer");

/**
 * §4.1: dry_run TIDAK punya default value. Caller wajib eksplisit.
 * §12 Phase Gate (OPERATION SIDEWINDER): sebelum exit condition terpenuhi
 * (dry-run diuji + divalidasi Commander), dry_run wajib true di semua deployment.
 */
export async function runActionLayer(
  input: ActionLayerInput,
  dbDeps?: DbEffectorDeps,
): Promise<ActionLayerReport> {
  if (input.config.dry_run === undefined || input.config.dry_run === null) {
    throw new ActionLayerConfigError("config.dry_run is required — no implicit default (C-02)");
  }
  if (!input.config.repo_root) {
    throw new ActionLayerConfigError("config.repo_root is required");
  }

  const effectors = new Map<string, Effector>([
    ["file_write", new FileWriteEffector()],
    ["file_delete", new FileDeleteEffector()],
    ["file_rename", new FileRenameEffector()],
    ["git_commit", new GitCommitEffector()],
    ["git_branch", new GitBranchEffector()],
    ["git_push", new GitPushEffector()],
    ["test_run", new TestRunEffector()],
    ["ci_trigger", new CiTriggerEffector()],
    ["shell_command", new ShellCommandEffector()],
  ]);

  // DbEffector hanya didaftarkan jika koneksi DB disuplai oleh caller (§8 OQ-DB)
  if (dbDeps) {
    effectors.set("db_query", new DbQueryEffector(dbDeps));
  }

  const engine = new ExecutionEngine(effectors, logger.child({ scan_id: input.plan.scan_id }));
  return engine.run(input);
}

export type { ActionLayerInput, ActionLayerReport } from "./types.js";
