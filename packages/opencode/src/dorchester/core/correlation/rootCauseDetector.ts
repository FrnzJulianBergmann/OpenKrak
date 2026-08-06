// engine/core/correlation/rootCauseDetector.ts
// Correlation Engine — Step 3: Root Cause Detector
// correlation_engine.md §5 Step 3 + §6 Confidence Scoring Formula
// Constitution Rule 3: Pure deterministic. No AI calls.
//
// PERF FIX: was O(n²) BFS — for each (root, related) pair it ran a full
// BFS from scratch. Now O(n × (V+E)): one call to getShortestPathsFromSource
// per root gives distances to ALL reachable nodes at once, then the inner
// loop is just Map lookups. For 17k findings this cuts ~17M BFS ops down to
// ≤ rootCandidates.length × (V+E) traversals.

import type { Finding } from "../../contracts/index.js";
import type { ClassifiedFinding } from "./findingClassifier.js";
import type { DependencyGraphReader } from "./dependencyPathResolver.js";
import { isCompatibleRootCause } from "./findingClassifier.js";

export interface RootCauseCandidate {
  rootFinding: Finding;
  relatedFinding: Finding;
  path: string[];
  pathLength: number;
  confidence: number;
}

/**
 * Confidence scoring formula — correlation_engine.md §6
 *
 * base_confidence = 1.0
 * path_penalty    = 0.1 × path_length
 * type_bonus      = 0.2 if type_compatible
 * hotspot_bonus   = 0.1 × hotspot_score (if root is in a hotspot)
 *
 * final = min(1.0, base - path_penalty + type_bonus + hotspot_bonus)
 * Threshold: confidence ≥ 0.6 to be written
 */
function computeConfidence(
  pathLength: number,
  typeCompatible: boolean,
  hotspotScore: number,
): number {
  const base = 1.0;
  const pathPenalty = 0.1 * pathLength;
  const typeBonus = typeCompatible ? 0.2 : 0.0;
  const hotspotBonus = 0.1 * hotspotScore;
  return Math.min(1.0, base - pathPenalty + typeBonus + hotspotBonus);
}

export const CONFIDENCE_THRESHOLD = 0.6;

export function detectRootCauses(
  classified: ClassifiedFinding[],
  reader: DependencyGraphReader,
  hotspotScoreByFile: Map<string, number>,
): RootCauseCandidate[] {
  const candidates: RootCauseCandidate[] = [];

  const rootCandidates = classified.filter((c) => c.can_be_root);
  const allFindings = classified.map((c) => c.finding);

  for (const rootCf of rootCandidates) {
    const rootFinding = rootCf.finding;
    const rootNodeId = rootFinding.symbol ?? `${rootFinding.file}::file::0`;
    const hotspotScore = hotspotScoreByFile.get(rootFinding.file) ?? 0;

    // PERF: single BFS from this root to get distances to ALL reachable nodes.
    // Previously: getShortestPath() was called once per (root, related) pair.
    // Now: one call gives paths to every reachable node in the graph.
    const allPaths = reader.getShortestPathsFromSource(rootNodeId);

    for (const relatedFinding of allFindings) {
      if (relatedFinding.id === rootFinding.id) continue;

      const relatedNodeId = relatedFinding.symbol ?? `${relatedFinding.file}::file::0`;
      if (relatedNodeId === rootNodeId) continue;

      // O(1) Map lookup instead of O(V+E) BFS per pair
      const path = allPaths.get(relatedNodeId);
      if (!path) continue;

      const pathLength = path.length - 1;
      const typeCompatible = isCompatibleRootCause(rootFinding.type, relatedFinding.type);
      const confidence = computeConfidence(pathLength, typeCompatible, hotspotScore);

      if (confidence >= CONFIDENCE_THRESHOLD) {
        candidates.push({
          rootFinding,
          relatedFinding,
          path,
          pathLength,
          confidence,
        });
      }
    }
  }

  return candidates.sort((a, b) => b.confidence - a.confidence);
}
