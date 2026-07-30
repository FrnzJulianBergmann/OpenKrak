// engine/core/mahadata/objectiveAnalyzer.ts
// Mahadata Generator — Step 2: Objective Analyzer
// mahadata_generator.md §5 Step 2 + §6 Objective Analysis Rules
// Constitution Rule 3: Pure deterministic heuristic. No AI calls.

export type TaskType =
  | "bug_fix"
  | "refactor"
  | "security_audit"
  | "feature"
  | "architecture_review"
  | "general";

export type ScopeType = "file-level" | "module-level" | "system-level";

export interface ObjectiveContext {
  task_type: TaskType;
  scope: ScopeType;
  mentioned_entities: string[]; // file paths + CamelCase identifiers found in objective
}

/**
 * Task type keyword table — mahadata_generator.md §6, exact order.
 *
 * IMPORTANT: "restructure" belongs ONLY to architecture_review (§6 table).
 * It was removed from refactor bucket to match doc exactly.
 * First match wins — order matters.
 */
const TASK_TYPE_KEYWORDS: { keywords: string[]; type: TaskType }[] = [
  { keywords: ["fix", "bug", "error", "broken", "crash"],                              type: "bug_fix" },
  { keywords: ["refactor", "clean", "improve"],                                         type: "refactor" },
  { keywords: ["security", "vulnerability", "auth", "inject"],                         type: "security_audit" },
  { keywords: ["add", "implement", "build", "create", "feature"],                     type: "feature" },
  { keywords: ["architecture", "design", "restructure", "migrate"],                   type: "architecture_review" },
  // "general" is default — no keywords needed
];

// File path indicator: matches paths with known extensions
const FILE_INDICATOR_RE = /[\w/.-]+\.(ts|js|tsx|jsx|py|java|go|rs)\b/g;

// Module-level scope indicator — mahadata_generator.md §6 Scope Detection
const MODULE_INDICATOR_RE = /\b(module|service|layer|package|component)\b/gi;

// CamelCase identifiers (class/interface/type names typically mentioned by user)
const CAMEL_CASE_RE = /\b[A-Z][a-zA-Z0-9]+\b/g;

export function analyzeObjective(objective: string): ObjectiveContext {
  const lower = objective.toLowerCase();

  // ── Task Type Detection ─────────────────────────────────
  // First keyword bucket that matches wins (§6 — order is significant)
  let task_type: TaskType = "general";
  for (const { keywords, type } of TASK_TYPE_KEYWORDS) {
    if (keywords.some((kw) => lower.includes(kw))) {
      task_type = type;
      break;
    }
  }

  // ── Scope Detection ─────────────────────────────────────
  // Reset lastIndex on global regexes before use
  FILE_INDICATOR_RE.lastIndex = 0;
  MODULE_INDICATOR_RE.lastIndex = 0;

  const mentionedFiles = [...objective.matchAll(FILE_INDICATOR_RE)].map((m) => m[0]);
  const hasMentionedModule = MODULE_INDICATOR_RE.test(objective);

  let scope: ScopeType;
  if (mentionedFiles.length > 0) {
    scope = "file-level";
  } else if (hasMentionedModule) {
    scope = "module-level";
  } else {
    scope = "system-level";
  }

  // ── Entity Extraction ───────────────────────────────────
  CAMEL_CASE_RE.lastIndex = 0;
  const camelCaseEntities = [...objective.matchAll(CAMEL_CASE_RE)].map((m) => m[0]);
  const mentioned_entities = [...new Set([...mentionedFiles, ...camelCaseEntities])];

  return { task_type, scope, mentioned_entities };
}
