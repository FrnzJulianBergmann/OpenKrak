// engine/orchestrator/responseParser.ts
// Dorchester Orchestrator — ResponseParser
// dorchester_orchestrator.md §4.3

import { ZodError } from "zod";
import { ResponseParseError } from "./types.js";
import { validateOrchestratorPlan } from "./schema.js";
import type { OrchestratorPlan } from "./types.js";

const JSON_TAG_RE = /<json>([\s\S]*?)<\/json>/;

export class ResponseParser {
  parse(rawContent: string): OrchestratorPlan {
    const match = rawContent.match(JSON_TAG_RE);
    const jsonText = match ? match[1].trim() : rawContent.trim();

    let raw: unknown;
    try {
      raw = JSON.parse(jsonText);
    } catch (err) {
      throw new ResponseParseError(
        `Failed to JSON.parse LLM response: ${(err as Error).message}`,
      );
    }

    try {
      return validateOrchestratorPlan(raw);
    } catch (err) {
      if (err instanceof ZodError) throw err; // re-thrown for RetryManager to classify
      throw new ResponseParseError(`Unexpected parse error: ${(err as Error).message}`);
    }
  }
}
