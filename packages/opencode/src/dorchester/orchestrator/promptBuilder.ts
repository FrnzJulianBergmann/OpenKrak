// engine/orchestrator/promptBuilder.ts
// Dorchester Orchestrator — PromptBuilder
// dorchester_orchestrator.md §4.2
// Deterministic, pure function, no side effects. Token budget trimming.

import type { ExecutionBrief } from "../contracts/index.js";

const SYSTEM_PROMPT = `Kamu adalah execution planner untuk Vanguard — Software Intelligence System.
Tugasmu adalah menghasilkan OrchestratorPlan berdasarkan ExecutionBrief yang diberikan.

Rules yang tidak boleh dilanggar:
1. Output harus JSON valid sesuai OrchestratorPlan schema.
2. Setiap action harus memiliki action_id (UUID), order unik, dan depends_on yang valid.
3. Jika execution tidak aman, set blocked: true dan blocked_reason yang jelas.
4. confidence harus mencerminkan keyakinan aktual — jangan inflasi.
5. Jangan tambahkan action yang tidak dapat di-derive dari ExecutionBrief.
6. is_reversible harus jujur — jika ragu, set false.

Output format:
<json>
{ OrchestratorPlan JSON }
</json>`;

// Rough heuristic: ~4 chars per token (English/Indonesian mixed prose)
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * §4.2 trimming priority when over budget:
 * 1. Keep: objective, critical_context, constraints
 * 2. Trim first: key_correlations (top 5 -> top 3)
 * 3. Trim last: priority_hotspots (top 5 -> top 3)
 */
export function buildPrompt(
  brief: ExecutionBrief,
  maxTokens: number,
): { systemPrompt: string; userPrompt: string; estimatedTokens: number } {
  let hotspots = brief.priority_hotspots;
  let correlations = brief.key_correlations;

  let userPrompt = assembleUserPrompt(brief, hotspots, correlations);
  let estimated = estimateTokens(SYSTEM_PROMPT + userPrompt);

  if (estimated > maxTokens) {
    correlations = correlations.slice(0, 3);
    userPrompt = assembleUserPrompt(brief, hotspots, correlations);
    estimated = estimateTokens(SYSTEM_PROMPT + userPrompt);
  }

  if (estimated > maxTokens) {
    hotspots = hotspots.slice(0, 3);
    userPrompt = assembleUserPrompt(brief, hotspots, correlations);
    estimated = estimateTokens(SYSTEM_PROMPT + userPrompt);
  }

  return { systemPrompt: SYSTEM_PROMPT, userPrompt, estimatedTokens: estimated };
}

function assembleUserPrompt(
  brief: ExecutionBrief,
  hotspots: ExecutionBrief["priority_hotspots"],
  correlations: ExecutionBrief["key_correlations"],
): string {
  const criticalContext = brief.critical_context
    .map((c) => `- ${c.key}: ${c.value}`)
    .join("\n");

  const hotspotsList = hotspots
    .map((h, i) => `${i + 1}. ${h.path} — ${h.why_relevant}`)
    .join("\n");

  const correlationsList = correlations
    .map((c) => `- [${c.id}] ${c.summary}`)
    .join("\n");

  const entryPoints = brief.recommended_entry_points
    .map((e) => `- ${e.path}${e.symbol ? `::${e.symbol}` : ""} — ${e.reason}`)
    .join("\n");

  const constraints = brief.constraints.map((c) => `- ${c}`).join("\n");

  return `## Objective
${brief.objective}

## Repository Summary
${brief.repository_summary}

## Critical Context
${criticalContext || "(none)"}

## Priority Hotspots
${hotspotsList || "(none)"}

## Key Correlations
${correlationsList || "(none)"}

## Recommended Entry Points
${entryPoints || "(none)"}

## Constraints
${constraints || "(none)"}

## Token Budget Advisory
Estimated context: ${brief.token_budget_estimate} tokens.`;
}
