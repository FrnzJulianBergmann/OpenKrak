// engine/ports/ai/llmClient.ts
// AI Port — Universal OpenAI-compatible LLM client wrapper
// Provider-agnostic: works with any OpenAI-compatible baseURL
// (OpenAI, Gemini, DeepSeek, Ollama, OpenRouter, Anthropic-compat gateways, etc.)
// ADR-005: API key wajib dari env. ADR-015: no LangChain/AI framework wrapper.

import OpenAI from "openai";

export interface LLMClientConfig {
  apiKey: string;
  baseURL: string;
  model: string;
  maxTokens: number;
  temperature: number;
  timeoutMs: number;
}

export interface LLMChatResult {
  content: string;
  tokensUsed: number;
}

export class LLMApiError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "LLMApiError";
  }
}

export class LLMTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LLMTimeoutError";
  }
}

export class LLMServerError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "LLMServerError";
  }
}

/**
 * Thin wrapper over the openai SDK pointed at any OpenAI-compatible
 * baseURL. No LangChain, no agent framework (ADR-015).
 * Provider is determined entirely by LLM_BASE_URL / LLM_MODEL config —
 * this client has no knowledge of or dependency on any specific vendor.
 */
export class LLMClient {
  private readonly client: OpenAI;

  constructor(private readonly config: LLMClientConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      timeout: config.timeoutMs,
    });
  }

  async chat(systemPrompt: string, userPrompt: string): Promise<LLMChatResult> {
    try {
      const response = await this.client.chat.completions.create({
        model: this.config.model,
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      });

      const content = response.choices[0]?.message?.content ?? "";
      const tokensUsed = response.usage?.total_tokens ?? 0;

      return { content, tokensUsed };
    } catch (err: unknown) {
      this.rethrowClassified(err);
    }
  }

  private rethrowClassified(err: unknown): never {
    const anyErr = err as { status?: number; message?: string; name?: string };

    if (anyErr.name === "APIConnectionTimeoutError") {
      throw new LLMTimeoutError(anyErr.message ?? "LLM API timeout");
    }
    if (typeof anyErr.status === "number") {
      if (anyErr.status >= 500) {
        throw new LLMServerError(anyErr.message ?? "LLM server error", anyErr.status);
      }
      throw new LLMApiError(anyErr.message ?? "LLM API error", anyErr.status);
    }
    throw new LLMApiError(anyErr.message ?? "Unknown LLM client error");
  }
}
