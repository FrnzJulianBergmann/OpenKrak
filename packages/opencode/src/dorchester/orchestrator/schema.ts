// engine/orchestrator/schema.ts
// Dorchester Orchestrator — Zod Runtime Validation
// dorchester_orchestrator.md §3.3 + C-06 (output wajib divalidasi Zod)

import { z } from "zod";
import type { OrchestratorPlan } from "./types.js";

const PlannedActionSchema = z.object({
  action_id: z.string().uuid(),
  order: z.number().int().positive(),
  type: z.enum([
    "file_write", "file_delete", "file_rename",
    "git_commit", "git_branch", "git_push",
    "db_query", "test_run", "ci_trigger", "shell_command",
  ]),
  target: z.string().min(1),
  description: z.string().max(200),
  parameters: z.record(z.unknown()),
  depends_on: z.array(z.string()),
  is_reversible: z.boolean(),
  risk_level: z.enum(["critical", "high", "medium", "low"]),
  dry_run_safe: z.boolean(),
});

export const OrchestratorPlanSchema = z.object({
  plan_id: z.string(),
  generated_at: z.string(),
  scan_id: z.string(),
  model_used: z.string(),
  tokens_used: z.number().int().nonnegative(),
  reasoning_summary: z.string().max(500),
  actions: z.array(PlannedActionSchema),
  confidence: z.number().min(0).max(1),
  warnings: z.array(z.string()),
  blocked: z.boolean(),
  blocked_reason: z.string().nullable(),
});

export function validateOrchestratorPlan(raw: unknown): OrchestratorPlan {
  return OrchestratorPlanSchema.parse(raw) as OrchestratorPlan;
}
