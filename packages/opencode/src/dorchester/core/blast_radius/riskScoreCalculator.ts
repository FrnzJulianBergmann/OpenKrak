// engine/core/blast_radius/riskScoreCalculator.ts
// Blast Radius Engine — Step 7: Risk Score Calculator
// blast_radius_engine.md §5 Step 7
// Constitution Rule 3: Pure deterministic. No AI.

import type { ModuleImpact } from "./moduleServiceAggregator.js";
import type { ServiceImpact } from "./moduleServiceAggregator.js";
import type { ApiImpact } from "./apiImpactClassifier.js";

export function calculateRiskScore(params: {
  hotspotScore: number | null; // hotspot.score for trigger file, else 0.5 per spec
  totalAffectedFiles: number;
  totalModules: number;
  moduleImpacts: ModuleImpact[];
  totalServices: number;
  serviceImpacts: ServiceImpact[];
  apiImpacts: ApiImpact[];
}): number {
  const {
    hotspotScore,
    totalAffectedFiles,
    totalModules,
    moduleImpacts,
    totalServices,
    serviceImpacts,
    apiImpacts,
  } = params;

  const baseScore = hotspotScore ?? 0.5;

  const fileFactor = Math.min(1.0, totalAffectedFiles / 50);

  const fullModules = moduleImpacts.filter((m) => m.impact_level === "full").length;
  const moduleFactor = totalModules > 0 ? fullModules / totalModules : 0;

  const fullServices = serviceImpacts.filter((s) => s.impact_level === "full").length;
  const serviceFactor = totalServices > 0 ? fullServices / totalServices : 0;

  const breakingApis = apiImpacts.filter((a) => a.impact_level === "breaking").length;
  const breakingFactor = breakingApis * 0.1;

  const riskScore =
    baseScore * 0.4 +
    fileFactor * 0.25 +
    moduleFactor * 0.2 +
    serviceFactor * 0.1 +
    breakingFactor * 0.05;

  return Math.min(1.0, riskScore);
}
