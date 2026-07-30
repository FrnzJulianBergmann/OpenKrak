// engine/action_contracts/OrchestratorPlan.ts
// Action Contracts — OrchestratorPlan
// Moved from orchestrator/types.ts per Architecture Change: action_contracts/ folder creation
// Source spec: dorchester_orchestrator.md §3.2

import type { PlannedAction } from "./PlannedAction.js";

export interface OrchestratorPlan {
  plan_id: string;
  generated_at: string;
  scan_id: string;
  model_used: string;
  tokens_used: number;
  reasoning_summary: string;
  actions: PlannedAction[];
  confidence: number;
  warnings: string[];
  blocked: boolean;
  blocked_reason: string | null;
}
