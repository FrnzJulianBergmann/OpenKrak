// engine/core/mahadata/relevanceRanker.ts
// Mahadata Generator — Step 3: Relevance Ranker
// mahadata_generator.md §5 Step 3
// Constitution Rule 3: Pure deterministic scoring. No AI calls.

import type { Hotspot, Correlation, HotspotReasonType } from "../../contracts/index.js";
import type { ObjectiveContext, TaskType } from "./objectiveAnalyzer.js";

export interface RankedHotspot {
  hotspot: Hotspot;
  relevance_score: number;
}

export interface RankedCorrelation {
  correlation: Correlation;
  relevance_score: number;
}

/**
 * Relevance scoring formula — mahadata_generator.md §5 Step 3:
 *
 *   entity_mention_bonus  = +0.3  if hotspot.path mentioned in objective entities
 *   task_type_alignment   = +0.2  if any hotspot reason.type aligns with task type
 *   hotspot_score_contrib = hotspot.score × 0.5
 *
 *   final = min(1.0, entity_mention + task_type_alignment + hotspot_score_contrib)
 *
 * For correlations:
 *   entity_mention_bonus  = +0.3  if consolidated_title mentioned in entities
 *   confidence_contrib    = correlation.confidence × 0.3
 *
 *   final = min(1.0, entity_mention + confidence_contrib)
 */

/**
 * Task type → HotspotReasonType[] mapping.
 * Uses exact HotspotReasonType values from mahadata_schema.md §4.6.
 * No string manipulation — direct type comparison.
 */
const TASK_TYPE_HOTSPOT_REASON_MAP: Record<TaskType, HotspotReasonType[]> = {
  bug_fix:             ["circular_dependency", "high_coupling", "high_complexity"],
  refactor:            ["high_coupling", "high_complexity", "god_object"],
  security_audit:      ["god_object", "high_coupling"],
  feature:             ["circular_dependency", "high_coupling"],
  architecture_review: ["high_coupling", "deep_inheritance", "god_object", "circular_dependency"],
  general:             [],
};

export function rankHotspots(
  hotspots: Hotspot[],
  ctx: ObjectiveContext,
): RankedHotspot[] {
  // Lower-case entity set for case-insensitive path comparison
  const entitySet = new Set(ctx.mentioned_entities.map((e) => e.toLowerCase()));
  const alignedReasonTypes = new Set<HotspotReasonType>(
    TASK_TYPE_HOTSPOT_REASON_MAP[ctx.task_type] ?? [],
  );

  return hotspots
    .map((h) => {
      // +0.3 if hotspot file path is mentioned in objective
      const entityMentionBonus = entitySet.has(h.path.toLowerCase()) ? 0.3 : 0.0;

      // +0.2 if any of hotspot's reason types aligns with the task type
      const taskTypeBonus = h.reasons.some((r) => alignedReasonTypes.has(r.type)) ? 0.2 : 0.0;

      // hotspot.score × 0.5 (passthrough)
      const hotspotScoreContrib = h.score * 0.5;

      const relevance_score = Math.min(1.0, entityMentionBonus + taskTypeBonus + hotspotScoreContrib);
      return { hotspot: h, relevance_score };
    })
    .sort((a, b) => b.relevance_score - a.relevance_score);
}

export function rankCorrelations(
  correlations: Correlation[],
  ctx: ObjectiveContext,
): RankedCorrelation[] {
  // Only non-noise-suppressed correlations are ranked (§5 Step 3 — primary)
  const entitySet = new Set(ctx.mentioned_entities.map((e) => e.toLowerCase()));

  return correlations
    .filter((c) => !c.noise_suppressed)
    .map((c) => {
      // +0.3 if consolidated_title contains a mentioned entity
      const titleLower = c.consolidated_title.toLowerCase();
      const entityMentionBonus = ctx.mentioned_entities.some((e) =>
        titleLower.includes(e.toLowerCase()),
      )
        ? 0.3
        : 0.0;

      // correlation.confidence × 0.3
      const confidenceContrib = c.confidence * 0.3;

      const relevance_score = Math.min(1.0, entityMentionBonus + confidenceContrib);
      return { correlation: c, relevance_score };
    })
    .sort((a, b) => b.relevance_score - a.relevance_score);
}
