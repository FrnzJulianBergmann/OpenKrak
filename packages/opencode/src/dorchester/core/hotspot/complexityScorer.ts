// engine/core/hotspot/complexityScorer.ts
// Hotspot Registry — Complexity Calculator
// hotspot_registry.md §5 + §6.2 Complexity Thresholds
// Input: FileIndexEntry[].complexity (populated by DeepStrike)
// Output: Per-file complexity scores (normalized 0.0–1.0)

import type { FileIndexEntry } from "../../contracts/index.js";

export interface ComplexityScore {
  file: string;
  cyclomatic: number | null;   // from FileIndexEntry.complexity
  cognitive: number | null;    // from FileIndexEntry.complexity
  loc: number;                 // from FileIndexEntry.complexity.loc
  score: number;               // 0.0–1.0 (normalized)
}

const LOC_CRITICAL = 500;   // file-level LOC threshold
const LOC_WARNING = 200;
const CYCLOMATIC_CRITICAL = 15;
const CYCLOMATIC_WARNING = 10;

export function computeComplexityScores(fileIndex: FileIndexEntry[]): ComplexityScore[] {
  const maxLoc = Math.max(...fileIndex.map((f) => f.loc || 0), 1);
  const maxCyclomatic = Math.max(
    ...fileIndex.map((f) => f.complexity.cyclomatic || 0),
    1,
  );

  return fileIndex.map((f) => {
    const locScore = Math.min(f.loc / maxLoc, 1.0);
    const cyclomaticScore = f.complexity.cyclomatic
      ? Math.min(f.complexity.cyclomatic / maxCyclomatic, 1.0)
      : 0;
    // Weighted: 60% LOC, 40% cyclomatic (if available)
    const score = f.complexity.cyclomatic
      ? locScore * 0.6 + cyclomaticScore * 0.4
      : locScore * 0.6;

    return {
      file: f.path,
      cyclomatic: f.complexity.cyclomatic,
      cognitive: f.complexity.cognitive,
      loc: f.loc,
      score,
    };
  });
}

export function complexityThresholdExceeded(
  c: ComplexityScore,
): "cyclomatic" | "loc" | "cognitive" | "multiple" | null {
  const thresholds: string[] = [];
  if (c.loc > LOC_CRITICAL) thresholds.push("loc");
  if (c.cyclomatic && c.cyclomatic > CYCLOMATIC_CRITICAL) thresholds.push("cyclomatic");
  if (thresholds.length === 0) return null;
  if (thresholds.length === 1) return thresholds[0] as any;
  return "multiple";
}

export function complexitySeverity(c: ComplexityScore): "high" | "medium" | null {
  if (c.loc > LOC_CRITICAL || (c.cyclomatic && c.cyclomatic > CYCLOMATIC_CRITICAL)) {
    return "high";
  }
  if (c.loc > LOC_WARNING || (c.cyclomatic && c.cyclomatic > CYCLOMATIC_WARNING)) {
    return "medium";
  }
  return null;
}

/**
 * File-level complexity score (0.0–1.0)
 * Deterministic, based on DeepStrike-extracted metrics.
 * No re-parsing, no invented data.
 */
export function fileComplexityScore(c: ComplexityScore): number {
  return c.score;
}
