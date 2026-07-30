// engine/core/correlation/noiseReducer.ts
// Correlation Engine — Step 5: Noise Reducer
// correlation_engine.md §5 Step 5 + §7 Noise Reduction Rules
// Constitution Rule 3: Pure deterministic. No AI calls.

import type { Finding } from "../../contracts/index.js";
import type { ImpactChain } from "./impactChainBuilder.js";

export interface NoiseTaggedFinding {
  finding: Finding;
  noise_suppressed: boolean;
  noise_reason: string | null;
}

/**
 * Noise Reduction Rules — correlation_engine.md §7
 *
 * Rule 1 — Duplicate: same file + same type + line overlap (±5)
 * Rule 2 — Derivative: leaf in impact chain depth > 3, severity ≤ root severity
 * Rule 3 — Redundant Root: finding in 2+ chains as intermediate → consolidate
 *
 * IMPORTANT: noise suppression NEVER deletes findings — only marks them.
 */
export function tagNoise(
  findings: Finding[],
  chains: ImpactChain[],
): NoiseTaggedFinding[] {
  const suppressionReasons = new Map<string, string>(); // finding.id → reason

  const severityOrder: Record<string, number> = {
    critical: 4, high: 3, medium: 2, low: 1, info: 0,
  };

  // ── Rule 1: Duplicate Detection ────────────────────────
  // Group by (file, type) and look for overlapping line ranges
  // Also: findings of same type in same file — keep only highest severity
  const groupedByFileType = new Map<string, Finding[]>();
  for (const f of findings) {
    const key = `${f.file}::${f.type}`;
    if (!groupedByFileType.has(key)) groupedByFileType.set(key, []);
    groupedByFileType.get(key)!.push(f);
  }

  for (const group of groupedByFileType.values()) {
    if (group.length < 2) continue;
    // Sort by severity desc
    const sorted = [...group].sort(
      (a, b) => (severityOrder[b.severity] ?? 0) - (severityOrder[a.severity] ?? 0),
    );
    const keeper = sorted[0];
    for (const dup of sorted.slice(1)) {
      // Suppress if same severity (redundant) OR line overlap
      const sameOrLowerSev = (severityOrder[dup.severity] ?? 0) <= (severityOrder[keeper.severity] ?? 0);
      const lineOverlap = linesOverlap(dup.line_start, keeper.line_start, 20);
      if ((sameOrLowerSev || lineOverlap) && !suppressionReasons.has(dup.id)) {
        suppressionReasons.set(
          dup.id,
          `Duplicate of finding ${keeper.id} (same file, type${lineOverlap ? ', line range' : ', severity'})`,
        );
      }
    }
  }

  // ── Rule 2: Derivative Detection ───────────────────────
  // Build map: finding_id → which chain step it appears in
  const findingChainDepth = new Map<string, number>(); // finding.id → min depth it appears
  for (const chain of chains) {
    for (const step of chain.steps) {
      const existing = findingChainDepth.get(step.finding_id);
      if (existing === undefined || step.step < existing) {
        findingChainDepth.set(step.finding_id, step.step);
      }
    }
  }

  // Build map: finding_id → root severity for its chain
  const findingRootSeverity = new Map<string, string>();
  for (const chain of chains) {
    for (const relId of chain.relatedFindingIds) {
      findingRootSeverity.set(relId, chain.rootFinding.severity);
    }
  }

  for (const f of findings) {
    const depth = findingChainDepth.get(f.id);
    if (depth !== undefined && depth > 3) {
      const rootSev = findingRootSeverity.get(f.id);
      if (
        rootSev &&
        (severityOrder[f.severity] ?? 0) <= (severityOrder[rootSev] ?? 0) &&
        !suppressionReasons.has(f.id)
      ) {
        suppressionReasons.set(
          f.id,
          `Derivative finding: depth ${depth} in impact chain, severity (${f.severity}) ≤ root (${rootSev})`,
        );
      }
    }
  }

  // ── Rule 3: Redundant Root Detection ───────────────────
  // Count how many chains each finding appears in as intermediate
  const intermediateCount = new Map<string, number>();
  for (const chain of chains) {
    // Intermediates = related findings that are NOT in another chain's root
    for (const relId of chain.relatedFindingIds) {
      intermediateCount.set(relId, (intermediateCount.get(relId) ?? 0) + 1);
    }
  }

  for (const [findingId, count] of intermediateCount) {
    if (count >= 2 && !suppressionReasons.has(findingId)) {
      suppressionReasons.set(
        findingId,
        `Redundant: appears as intermediate in ${count} chains — consolidated to highest-confidence chain`,
      );
    }
  }

  // ── Tag all findings ────────────────────────────────────
  return findings.map((f) => ({
    finding: f,
    noise_suppressed: suppressionReasons.has(f.id),
    noise_reason: suppressionReasons.get(f.id) ?? null,
  }));
}

function linesOverlap(
  lineA: number | null,
  lineB: number | null,
  tolerance: number,
): boolean {
  if (lineA === null || lineB === null) return false;
  return Math.abs(lineA - lineB) <= tolerance;
}
