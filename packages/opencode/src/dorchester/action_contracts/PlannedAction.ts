// engine/action_contracts/PlannedAction.ts
// Action Contracts — PlannedAction
// Moved from orchestrator/types.ts per Architecture Change: action_contracts/ folder creation
// Source spec: dorchester_orchestrator.md §3.2

import type { ActionType } from "./ActionType.js";
import type { ActionParameters } from "./ActionParameters.js";

export interface PlannedAction {
  action_id: string;
  order: number;
  type: ActionType;
  target: string;
  description: string;
  parameters: ActionParameters;
  depends_on: string[];
  is_reversible: boolean;
  risk_level: "critical" | "high" | "medium" | "low";
  dry_run_safe: boolean;
}
