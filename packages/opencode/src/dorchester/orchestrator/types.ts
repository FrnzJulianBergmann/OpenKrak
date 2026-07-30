// engine/orchestrator/types.ts
// Dorchester Orchestrator — Types
// dorchester_orchestrator.md §3 Interface

import type { ExecutionBrief } from "../contracts/index.js";

// ── Action Contracts — Official Execution Language ──
// Moved to action_contracts/ (Architecture Change, Commander-authorized) to remove
// F14 (action_layer) → orchestrator/ sibling import violation per folder_structure.md
// v2.0 Import Rules. Re-exported here so existing local "./types.js" imports across
// orchestrator/ continue to resolve without modification.
export type {
  ActionType,
  FileWriteParams,
  FileDeleteParams,
  FileRenameParams,
  GitCommitParams,
  GitBranchParams,
  GitPushParams,
  DbQueryParams,
  TestRunParams,
  CiTriggerParams,
  ShellCommandParams,
  ActionParameters,
  PlannedAction,
  OrchestratorPlan,
} from "../action_contracts/index.js";

export interface OrchestratorOptions {
  dry_run?: boolean;
  max_tokens?: number;
  model?: string;
  temperature?: number;
}

export interface OrchestratorInput {
  brief: ExecutionBrief;
  options?: OrchestratorOptions;
}

// ── Error Taxonomy — dorchester_orchestrator.md §6 ──
export class OrchestratorInputError extends Error {
  constructor(message: string) { super(message); this.name = "OrchestratorInputError"; }
}
export class ResponseParseError extends Error {
  constructor(message: string) { super(message); this.name = "ResponseParseError"; }
}
export class PlanValidationError extends Error {
  constructor(message: string) { super(message); this.name = "PlanValidationError"; }
}
export class PlanCircularDependencyError extends Error {
  constructor(message: string) { super(message); this.name = "PlanCircularDependencyError"; }
}
export class TokenBudgetExceededError extends Error {
  constructor(message: string) { super(message); this.name = "TokenBudgetExceededError"; }
}
export class OrchestratorConfigError extends Error {
  constructor(message: string) { super(message); this.name = "OrchestratorConfigError"; }
}
