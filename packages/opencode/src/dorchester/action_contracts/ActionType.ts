// engine/action_contracts/ActionType.ts
// Action Contracts — ActionType
// Moved from orchestrator/types.ts per Architecture Change: action_contracts/ folder creation
// Source spec: dorchester_orchestrator.md §3.2, action_layer.md §3

export type ActionType =
  | "file_write" | "file_delete" | "file_rename"
  | "git_commit" | "git_branch" | "git_push"
  | "db_query" | "test_run" | "ci_trigger" | "shell_command";
