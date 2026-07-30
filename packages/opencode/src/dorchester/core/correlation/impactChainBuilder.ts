// engine/core/correlation/impactChainBuilder.ts
// Correlation Engine — Step 4: Impact Chain Builder
// correlation_engine.md §5 Step 4
// Constitution Rule 3: Pure deterministic BFS traversal. No AI calls.

import type { Finding, CorrelationImpactStep } from "../../contracts/index.js";
import type { RootCauseCandidate } from "./rootCauseDetector.js";

export interface ImpactChain {
  rootFinding: Finding;
  relatedFindingIds: string[];
  steps: CorrelationImpactStep[];
  confidence: number;
}

/**
 * Build impact chains from root cause candidates.
 * Groups all related findings under their root cause,
 * ordered by path length (step number).
 */
export function buildImpactChains(candidates: RootCauseCandidate[]): ImpactChain[] {
  // Group candidates by root finding id
  const byRoot = new Map<string, RootCauseCandidate[]>();
  for (const c of candidates) {
    const rootId = c.rootFinding.id;
    if (!byRoot.has(rootId)) byRoot.set(rootId, []);
    byRoot.get(rootId)!.push(c);
  }

  const chains: ImpactChain[] = [];

  for (const [, groupCandidates] of byRoot) {
    if (groupCandidates.length === 0) continue;

    // Sort related by path length (shortest first = highest severity)
    const sorted = [...groupCandidates].sort((a, b) => a.pathLength - b.pathLength);
    const root = sorted[0].rootFinding;

    // Aggregate confidence: average of all related confidences
    const avgConfidence =
      sorted.reduce((sum, c) => sum + c.confidence, 0) / sorted.length;

    const relatedFindingIds = [...new Set(sorted.map((c) => c.relatedFinding.id))];

    const steps: CorrelationImpactStep[] = sorted.map((c, idx) => ({
      step: idx + 1,
      finding_id: c.relatedFinding.id,
      mechanism: describeMechanism(root, c.relatedFinding, c.pathLength),
    }));

    chains.push({
      rootFinding: root,
      relatedFindingIds,
      steps,
      confidence: Math.round(avgConfidence * 10000) / 10000,
    });
  }

  return chains;
}

function describeMechanism(root: Finding, related: Finding, depth: number): string {
  return `${root.type} in ${root.file} propagates via ${depth} dependency hop(s) to ${related.type} in ${related.file}`;
}
