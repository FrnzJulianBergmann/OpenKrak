// engine/orchestrator/index.ts
// Dorchester Orchestrator — Main Entry Point
// Provider-agnostic §1, §4.1, §5 Dry-Run, §7 Logging
// Constitution Rule 7: input ExecutionBrief saja. Tidak menulis filesystem/git/db.

import { randomUUID } from "node:crypto";
import { createLogger } from "../shared/logger/index.js";
import { loadOrchestratorConfig } from "./config.js";
import { buildPrompt } from "./promptBuilder.js";
import { ResponseParser } from "./responseParser.js";
import { RetryManager } from "./retryManager.js";
import { PlanNormalizer } from "./planNormalizer.js";
import { LLMClient } from "../ports/ai/llmClient.js";
import {
  OrchestratorInputError,
} from "./types.js";
import type { OrchestratorInput, OrchestratorPlan } from "./types.js";

const logger = createLogger("orchestrator");

export async function orchestrate(input: OrchestratorInput): Promise<OrchestratorPlan> {
  const { brief, options = {} } = input;

  if (!brief || !brief.objective) {
    throw new OrchestratorInputError("ExecutionBrief.objective is required");
  }

  const config = loadOrchestratorConfig();
  const model = options.model ?? config.LLM_MODEL;
  const maxTokens = options.max_tokens ?? config.LLM_MAX_TOKENS;
  const temperature = options.temperature ?? config.LLM_TEMPERATURE;
  const dryRun = options.dry_run ?? false;

  const scanId = (brief as unknown as { scan_id?: string }).scan_id ?? "unknown";
  const log = logger.child({ scan_id: scanId });

  log.info(
    { event: "orchestrator.start", scan_id: scanId, dry_run: dryRun, model, provider: config.LLM_PROVIDER, token_budget_estimate: brief.token_budget_estimate },
    "Orchestrator started",
  );

  const start = Date.now();

  // ── PromptBuilder ────────────────────────────────────────
  const { systemPrompt, userPrompt, estimatedTokens } = buildPrompt(brief, maxTokens);
  log.debug(
    { event: "prompt.assembled", scan_id: scanId, prompt_length_chars: userPrompt.length, estimated_tokens: estimatedTokens },
    "Prompt assembled",
  );

  // ── Dry-Run Mode — §5 ────────────────────────────────────
  if (dryRun) {
    log.info(
      { event: "orchestrator.dry_run", scan_id: scanId, prompt_preview_chars: Math.min(200, userPrompt.length) },
      "Dry run — LLM API not called",
    );
    return {
      plan_id: randomUUID(),
      generated_at: new Date().toISOString(),
      scan_id: scanId,
      model_used: "dry-run-mock",
      tokens_used: 0,
      reasoning_summary: "[DRY RUN] Mock plan — LLM API not called.",
      actions: [],
      confidence: 0,
      warnings: ["[DRY RUN] This is a mock plan. No API call was made."],
      blocked: false,
      blocked_reason: null,
    };
  }

  // ── API Client + Retry ───────────────────────────────────
  const client = new LLMClient({
    apiKey: config.LLM_API_KEY,
    baseURL: config.LLM_BASE_URL,
    model,
    maxTokens,
    temperature,
    timeoutMs: config.LLM_TIMEOUT_MS,
  });

  const retryManager = new RetryManager(log, { retries: config.LLM_MAX_RETRIES });
  const parser = new ResponseParser();
  const normalizer = new PlanNormalizer();

  let attempt = 0;
  const plan = await retryManager.withRetry(async () => {
    attempt += 1;
    log.info({ event: "api.call.start", scan_id: scanId, model, attempt_number: attempt }, "Calling LLM API");

    const callStart = Date.now();
    const { content, tokensUsed } = await client.chat(systemPrompt, userPrompt);
    log.info(
      { event: "api.call.success", scan_id: scanId, tokens_used: tokensUsed, latency_ms: Date.now() - callStart },
      "LLM API call succeeded",
    );

    try {
      const parsed = parser.parse(content);
      log.debug(
        { event: "response.parse.success", scan_id: scanId, action_count: parsed.actions.length },
        "Response parsed",
      );
      return { ...parsed, tokens_used: tokensUsed, model_used: model };
    } catch (err) {
      log.warn(
        { event: "response.parse.failure", scan_id: scanId, error_message: (err as Error).message },
        "Response parse failed",
      );
      throw err;
    }
  }, "llm_chat");

  // ── PlanNormalizer ───────────────────────────────────────
  const normalized = normalizer.normalize(plan, scanId);

  log.info(
    {
      event: "plan.validated",
      scan_id: scanId,
      plan_id: normalized.plan_id,
      action_count: normalized.actions.length,
      confidence: normalized.confidence,
      blocked: normalized.blocked,
    },
    "Plan validated",
  );

  if (normalized.blocked) {
    log.warn(
      { event: "plan.blocked", scan_id: scanId, plan_id: normalized.plan_id, blocked_reason: normalized.blocked_reason },
      "Plan blocked by orchestrator LLM",
    );
  }

  log.info(
    { event: "orchestrator.complete", scan_id: scanId, plan_id: normalized.plan_id, total_latency_ms: Date.now() - start },
    "Orchestrator complete",
  );

  return normalized;
}
