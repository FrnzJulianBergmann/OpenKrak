// engine/orchestrator/retryManager.ts
// Dorchester Orchestrator — RetryManager
// dorchester_orchestrator.md §4.4 + §6 retry policy

import pRetry, { AbortError } from "p-retry";
import { ZodError } from "zod";
import type { Logger } from "../shared/logger/index.js";
import { LLMApiError } from "../ports/ai/llmClient.js";

export interface RetryManagerOptions {
  retries: number;
}

export class RetryManager {
  constructor(private readonly logger: Logger, private readonly options: RetryManagerOptions) {}

  async withRetry<T>(operation: () => Promise<T>, context: string): Promise<T> {
    let zodHintApplied = false;

    return pRetry(
      async () => {
        try {
          return await operation();
        } catch (err) {
          // 4xx (non-429) -> no retry, propagate immediately
          if (err instanceof LLMApiError && err.status !== 429) {
            throw new AbortError(err);
          }
          // ZodError -> retry once only
          if (err instanceof ZodError) {
            if (zodHintApplied) throw new AbortError(err);
            zodHintApplied = true;
            throw err;
          }
          throw err;
        }
      },
      {
        retries: this.options.retries,
        factor: 2,
        minTimeout: 1000,
        maxTimeout: 8000,
        onFailedAttempt: (error) => {
          this.logger.warn(
            {
              component: "orchestrator",
              context,
              attempt: error.attemptNumber,
              retriesLeft: error.retriesLeft,
              error: error.message,
            },
            "Retry attempt",
          );
        },
      },
    );
  }
}
