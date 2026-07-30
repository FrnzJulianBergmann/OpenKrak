// engine/action_contracts/ActionParameters.ts
// Action Contracts — ActionParameters (discriminated union per ActionType)
// Moved from orchestrator/types.ts per Architecture Change: action_contracts/ folder creation
// Source spec: dorchester_orchestrator.md §3.2, action_layer.md §3.1–§3.6

export interface FileWriteParams {
  path: string;
  content: string;
  encoding?: "utf-8";
  create_dirs?: boolean;
}

export interface FileDeleteParams {
  path: string;
  require_exists?: boolean;
}

export interface FileRenameParams {
  from: string;
  to: string;
  overwrite?: boolean;
}

export interface GitCommitParams {
  message: string;
  files: string[];
  author?: string;
  allow_empty?: boolean;
}

export interface GitBranchParams {
  name: string;
  from?: string;
  checkout?: boolean;
}

export interface GitPushParams {
  remote?: string;
  branch?: string;
  force?: boolean;
  force_confirmation?: boolean;
  set_upstream?: boolean;
}

export interface DbQueryParams {
  query: string;
  params?: unknown[];
  database?: string;
  transaction?: boolean;
  expect_rows?: number;
  confirmed?: boolean;
}

export interface TestRunParams {
  command: string;
  args?: string[];
  working_dir?: string;
  timeout_ms?: number;
  fail_on_test_failure?: boolean;
}

export interface CiTriggerParams {
  provider: "github_actions" | "gitlab_ci" | "jenkins" | "circleci";
  endpoint: string;
  payload: Record<string, unknown>;
  auth_env_var: string;
  timeout_ms?: number;
}

export interface ShellCommandParams {
  command: string;
  args?: string[];
  working_dir?: string;
  timeout_ms?: number;
  env?: Record<string, string>;
}

export type ActionParameters =
  | FileWriteParams | FileDeleteParams | FileRenameParams
  | GitCommitParams | GitBranchParams | GitPushParams
  | DbQueryParams | TestRunParams | CiTriggerParams | ShellCommandParams;
