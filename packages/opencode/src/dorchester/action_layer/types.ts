// engine/action_layer/types.ts
// Action Layer — Types
// action_layer.md §3 Effector interface, §5 Result Contract, §8 Config

import type { Logger } from "../shared/logger/index.js";
import type { OrchestratorPlan, ActionType } from "../action_contracts/index.js";

export interface ExecutionContext {
  dry_run: boolean;
  scan_id: string;
  plan_id: string;
  action_id: string;
  repo_root: string;
  logger: Logger;
  getBackup: (path: string) => string | null;
  setBackup: (path: string, content: string | null) => void;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface Effector<TParams = unknown, TResult = unknown> {
  readonly type: ActionType;
  execute(params: TParams, context: ExecutionContext): Promise<TResult>;
  rollback(params: TParams, context: ExecutionContext): Promise<void>;
  validate(params: TParams): ValidationResult;
}

export interface SafetyFailure {
  check: string;
  reason: string;
  fatal: boolean;
}

export interface SafetyCheckResult {
  safe: boolean;
  failures: SafetyFailure[];
}

export interface ActionError {
  class: string;
  message: string;
  stack?: string;
  safety_check_failures?: SafetyFailure[];
}

export interface ActionResult {
  action_id: string;
  action_type: ActionType;
  status: "success" | "failure" | "skipped" | "dry_run";
  started_at: string;
  completed_at: string;
  duration_ms: number;
  dry_run: boolean;
  output: unknown;
  error: ActionError | null;
  rollback_status: "not_attempted" | "success" | "failed" | "not_possible" | null;
  rollback_error: string | null;
}

export interface ActionLayerReport {
  report_id: string;
  plan_id: string;
  scan_id: string;
  generated_at: string;
  dry_run: boolean;
  status: "success" | "partial_success" | "failure" | "rolled_back" | "partial_rollback" | "rollback_failed";
  total_actions: number;
  executed_actions: number;
  successful_actions: number;
  failed_actions: number;
  skipped_actions: number;
  total_duration_ms: number;
  action_results: ActionResult[];
  rollback_failures: string[];
  manual_intervention_required: boolean;
  manual_intervention_details: string[];
  summary: string;
}

export interface DbConfig {
  driver: "postgres" | "sqlite" | "mysql";
  connection_env_var: string;
}

export interface ActionLayerConfig {
  dry_run: boolean; // REQUIRED, no default
  repo_root: string; // REQUIRED
  abort_on_first_failure?: boolean; // default true
  rollback_on_failure?: boolean; // default true
  db?: DbConfig | null;
}

export interface ActionLayerInput {
  plan: OrchestratorPlan;
  config: ActionLayerConfig;
}

// ── Error Taxonomy — action_layer.md §9 ──
export class ActionLayerConfigError extends Error {
  constructor(message: string) { super(message); this.name = "ActionLayerConfigError"; }
}
export class PlanPreflightError extends Error {
  constructor(message: string) { super(message); this.name = "PlanPreflightError"; }
}
export class SafetyCheckError extends Error {
  constructor(message: string, public readonly failures: SafetyFailure[]) {
    super(message); this.name = "SafetyCheckError";
  }
}
export class FileEffectorError extends Error {
  constructor(message: string) { super(message); this.name = "FileEffectorError"; }
}
export class GitEffectorError extends Error {
  constructor(message: string) { super(message); this.name = "GitEffectorError"; }
}
export class DbEffectorError extends Error {
  constructor(message: string) { super(message); this.name = "DbEffectorError"; }
}
export class TestEffectorError extends Error {
  constructor(message: string) { super(message); this.name = "TestEffectorError"; }
}
export class CiEffectorError extends Error {
  constructor(message: string) { super(message); this.name = "CiEffectorError"; }
}
export class ShellEffectorError extends Error {
  constructor(message: string) { super(message); this.name = "ShellEffectorError"; }
}
export class RollbackError extends Error {
  constructor(message: string) { super(message); this.name = "RollbackError"; }
}
