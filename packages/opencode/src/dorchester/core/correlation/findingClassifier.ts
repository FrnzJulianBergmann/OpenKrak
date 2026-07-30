// engine/core/correlation/findingClassifier.ts
// Correlation Engine — Step 1: Finding Classifier
// correlation_engine.md §5 Step 1
// Constitution Rule 3: Pure deterministic. No AI calls.

import type { Finding, FindingType } from "../../contracts/index.js";

export interface ClassifiedFinding {
  finding: Finding;
  /** True if this finding type can be a root cause (not a leaf) */
  can_be_root: boolean;
  /** Finding types this can cause — based on compatibility matrix §6 */
  can_cause: FindingType[];
}

/**
 * Finding Type Compatibility Matrix — correlation_engine.md §6
 * Defines which finding type can be root cause of which other types.
 */
const COMPATIBILITY_MATRIX: Partial<Record<FindingType, FindingType[]>> = {
  circular_dependency: ["missing_symbol", "coupling_issue", "architecture_violation"],
  architecture_violation: ["coupling_issue", "complexity_issue", "security_pattern"],
  dependency_issue: ["missing_symbol", "coupling_issue", "security_pattern"],
  security_pattern: ["coupling_issue", "architecture_violation"],
  coupling_issue: ["coupling_issue", "complexity_issue", "architecture_violation", "missing_symbol"],
  // missing_symbol is a leaf — cannot be root cause
  // dead_code — not in matrix as root
};

/** Finding types that CANNOT be root causes (leaf findings) */
const LEAF_TYPES = new Set<FindingType>(["missing_symbol", "dead_code"]);

export function classifyFindings(findings: Finding[]): ClassifiedFinding[] {
  return findings.map((f) => ({
    finding: f,
    can_be_root: !LEAF_TYPES.has(f.type),
    can_cause: COMPATIBILITY_MATRIX[f.type] ?? [],
  }));
}

/**
 * Given two finding types, check if A can cause B
 * per the compatibility matrix (§6)
 */
export function isCompatibleRootCause(rootType: FindingType, leafType: FindingType): boolean {
  const canCause = COMPATIBILITY_MATRIX[rootType];
  return canCause?.includes(leafType) ?? false;
}
