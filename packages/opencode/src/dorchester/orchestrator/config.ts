// engine/orchestrator/config.ts
// Dorchester Orchestrator — Configuration
// Provider-agnostic: any OpenAI-compatible endpoint (OpenAI, Gemini, LLM,
// Ollama, OpenRouter, local gateways, etc). All from env var, no config file. ADR-005.
//
// Set LLM_BASE_URL + LLM_MODEL + LLM_API_KEY to point at whichever provider
// you want. LLM_PROVIDER is an optional free-form label used only for
// logging/telemetry — it does not gate which providers are allowed.

import { z } from "zod";
import { OrchestratorConfigError } from "./types.js";

const provider = process.env["LLM_PROVIDER"] ?? "custom";
const isLocal = provider === "ollama" || provider === "local";

const ConfigSchema = z.object({
  // dummy key accepted for local providers that don't require auth
  LLM_API_KEY: z
    .string()
    .min(1)
    .default(isLocal ? "local" : ""),
  LLM_BASE_URL: z
    .string()
    .default(isLocal ? "http://localhost:11434/v1" : "https://api.openai.com/v1"),
  LLM_MODEL: z
    .string()
    .default(isLocal ? "qwen2.5-coder:7b" : "gpt-4.1"),
  LLM_MAX_TOKENS: z.coerce.number().int().positive().default(8000),
  LLM_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.0),
  // Local CPU inference tends to be slower — allow longer timeout
  LLM_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(isLocal ? 120000 : 30000),
  LLM_MAX_RETRIES: z.coerce.number().int().nonnegative().default(3),
  // Free-form label, not an allowlist — any provider name is accepted.
  LLM_PROVIDER: z.string().default("custom"),
});

export type OrchestratorConfig = z.infer<typeof ConfigSchema>;

export function loadOrchestratorConfig(env: NodeJS.ProcessEnv = process.env): OrchestratorConfig {
  const result = ConfigSchema.safeParse(env);
  if (!result.success) {
    throw new OrchestratorConfigError(
      `Invalid orchestrator config: ${result.error.issues.map((i) => i.path.join(".") + ": " + i.message).join("; ")}`,
    );
  }
  return result.data;
}
