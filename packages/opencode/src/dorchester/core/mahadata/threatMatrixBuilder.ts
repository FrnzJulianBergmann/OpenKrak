// engine/core/mahadata/threatMatrixBuilder.ts
// Mahadata Generator — Step 4: Threat Matrix Builder
// mahadata_generator.md §5 Step 4 + §8 Threat Matrix Classification Rules
// mahadata_generator.md §8 Amendment (Commander Decision P3, 2026-06-19):
//   god_object bukan finding type — dibaca dari hotspots[].reasons[].type
//   dan digunakan untuk menaikkan level kategori architecture + maintainability.
// Constitution Rule 3: Pure deterministic. No AI calls.
//
// NOTE: blockers/warnings are no longer capped at an arbitrary count — every
// critical/high finding is surfaced. Silently dropping blockers past an
// arbitrary limit is a correctness risk, not a UX nicety. risk_summary is
// no longer character-truncated either.

import type {
  Finding,
  Hotspot,
  ThreatMatrix,
  ThreatCategory,
  ThreatLevel,
  FindingType,
} from "../../contracts/index.js";

// Finding type → category mapping — mahadata_generator.md §8
// god_object TIDAK ada di sini (bukan finding type — lihat catatan Commander P3)
const FINDING_CATEGORY_MAP: Partial<Record<FindingType, (keyof ThreatMatrix["categories"])[]>> = {
  security_pattern:       ["security"],
  architecture_violation: ["architecture"],
  circular_dependency:    ["architecture"],
  coupling_issue:         ["maintainability"],
  complexity_issue:       ["maintainability", "reliability"],
  dependency_issue:       ["reliability"],
  missing_symbol:         ["reliability"],
  dead_code:              ["maintainability"],
  // performance category: no direct finding type maps here in Phase 1
};

const SEVERITY_ORDER: Record<string, number> = {
  critical: 4, high: 3, medium: 2, low: 1, info: 0,
};

// Level numeric values for overall_risk_score calculation
const LEVEL_VALUES: Record<ThreatLevel, number> = {
  critical: 1.0, high: 0.75, medium: 0.5, low: 0.25, none: 0.0,
};

type CategoryKey = keyof ThreatMatrix["categories"];

const ALL_CATEGORIES: CategoryKey[] = [
  "security", "architecture", "reliability", "maintainability", "performance",
];

// Weighted contribution per category to overall_risk_score
const CATEGORY_WEIGHTS: Record<CategoryKey, number> = {
  security:        0.35,
  architecture:    0.25,
  reliability:     0.20,
  maintainability: 0.15,
  performance:     0.05,
};

const LEVEL_ORDER: ThreatLevel[] = ["none", "low", "medium", "high", "critical"];

/**
 * Elevate a ThreatLevel by one step.
 * Used for god_object hotspot escalation (Commander Decision P3, 2026-06-19).
 * "critical" stays "critical" (ceiling).
 */
function elevateLevel(level: ThreatLevel): ThreatLevel {
  const idx = LEVEL_ORDER.indexOf(level);
  if (idx === -1 || idx === LEVEL_ORDER.length - 1) return level;
  return LEVEL_ORDER[idx + 1];
}

/**
 * Build ThreatMatrix from all findings + hotspots.
 *
 * @param findings   All findings from MahadataStore.getFindings()
 * @param hotspots   All hotspots from MahadataStore.getHotspots() — for god_object escalation
 */
export function buildThreatMatrix(
  findings: Finding[],
  hotspots: Hotspot[],
): ThreatMatrix {
  // ── Group findings by category ──────────────────────────
  const categoryFindingsMap = new Map<CategoryKey, Finding[]>();
  for (const cat of ALL_CATEGORIES) categoryFindingsMap.set(cat, []);

  for (const f of findings) {
    const cats = FINDING_CATEGORY_MAP[f.type] ?? [];
    for (const cat of cats) {
      categoryFindingsMap.get(cat)!.push(f);
    }
  }

  // ── Compute base level per category ────────────────────
  const categories = {} as ThreatMatrix["categories"];
  for (const cat of ALL_CATEGORIES) {
    const catFindings = categoryFindingsMap.get(cat)!;
    categories[cat] = computeCategory(catFindings);
  }

  // ── god_object escalation — Commander Decision P3, 2026-06-19 ──
  // If any hotspot has reason.type = "god_object", elevate:
  //   architecture level by one step
  //   maintainability level by one step
  const hasGodObject = hotspots.some((h) =>
    h.reasons.some((r) => r.type === "god_object"),
  );
  if (hasGodObject) {
    categories.architecture = {
      ...categories.architecture,
      level: elevateLevel(categories.architecture.level),
    };
    categories.maintainability = {
      ...categories.maintainability,
      level: elevateLevel(categories.maintainability.level),
    };
  }

  // ── Overall risk score ──────────────────────────────────
  let overallScore = 0;
  for (const cat of ALL_CATEGORIES) {
    overallScore += LEVEL_VALUES[categories[cat].level] * CATEGORY_WEIGHTS[cat];
  }
  overallScore = Math.round(overallScore * 100) / 100;

  // ── Blockers: ALL critical severity findings, uncapped ──
  const blockers = findings
    .filter((f) => f.severity === "critical")
    .map((f) => ({ finding_id: f.id, reason: f.title }));

  // ── Warnings: ALL high severity findings, uncapped ──────
  const warnings = findings
    .filter((f) => f.severity === "high")
    .map((f) => ({ finding_id: f.id, reason: f.title }));

  // ── Risk summary — full detail, no character cap ───────
  const activeCategorySummary = ALL_CATEGORIES
    .filter((c) => categories[c].level !== "none")
    .map((c) => `${c}: ${categories[c].level}`)
    .join(", ");
  const risk_summary = `${activeCategorySummary} | ${findings.length} total findings${hasGodObject ? " | god_object detected" : ""}`;

  return {
    overall_risk_score: overallScore,
    risk_summary,
    categories,
    blockers,
    warnings,
  };
}

/**
 * Compute ThreatCategory from a list of findings using severity distribution.
 * mahadata_generator.md §8 Level Calculation rules.
 */
function computeCategory(catFindings: Finding[]): ThreatCategory {
  if (catFindings.length === 0) {
    return { level: "none", finding_count: 0, top_finding_ids: [] };
  }

  const hasCritical = catFindings.some((f) => f.severity === "critical");
  const highCount   = catFindings.filter((f) => f.severity === "high").length;
  const mediumCount = catFindings.filter((f) => f.severity === "medium").length;
  // low + info counted together as "low"
  const lowCount    = catFindings.filter(
    (f) => f.severity === "low" || f.severity === "info",
  ).length;

  let level: ThreatLevel;
  if (hasCritical) {
    level = "critical";
  } else if (highCount > mediumCount) {
    level = "high";
  } else if (mediumCount > lowCount) {
    level = "medium";
  } else {
    // catFindings.length > 0 guaranteed by early return above
    level = "low";
  }

  // Top 3 findings sorted by severity descending — this is a curated
  // "most relevant" pointer field, not truncation of a bigger truth; the
  // full list is still available via `findings` in the parent Mahadata.
  const topFindingIds = [...catFindings]
    .sort((a, b) => (SEVERITY_ORDER[b.severity] ?? 0) - (SEVERITY_ORDER[a.severity] ?? 0))
    .slice(0, 3)
    .map((f) => f.id);

  return { level, finding_count: catFindings.length, top_finding_ids: topFindingIds };
}
