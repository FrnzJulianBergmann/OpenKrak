// engine/core/blast_radius/moduleServiceAggregator.ts
// Blast Radius Engine — Step 4: Module Impact Aggregator + Step 5: Service Impact Aggregator
// blast_radius_engine.md §5 Step 4–5
// Constitution Rule 3: Pure deterministic. No AI.

import type { FileIndexEntry, ProjectTopology } from "../../contracts/index.js";
import type { FileImpact } from "./impactCalculator.js";

export interface ModuleImpact {
  name: string;
  impact_level: "full" | "partial" | "minimal";
}

export interface ServiceImpact {
  name: string;
  impact_level: "full" | "partial" | "minimal";
}

/**
 * §5 Step 4: group impacted files by file_index.module.
 *  "full"    -> every file in module impacted
 *  "partial" -> some (not all) files in module impacted
 *  "minimal" -> only 1 file impacted AND module has > 3 files
 */
export function aggregateModuleImpact(
  impacts: FileImpact[],
  fileIndex: FileIndexEntry[],
): ModuleImpact[] {
  const fileToModule = new Map<string, string>();
  const moduleFileCount = new Map<string, number>();

  for (const f of fileIndex) {
    if (!f.module) continue;
    fileToModule.set(f.path, f.module);
    moduleFileCount.set(f.module, (moduleFileCount.get(f.module) ?? 0) + 1);
  }

  const impactedByModule = new Map<string, Set<string>>();
  for (const impact of impacts) {
    const mod = fileToModule.get(impact.path);
    if (!mod) continue;
    if (!impactedByModule.has(mod)) impactedByModule.set(mod, new Set());
    impactedByModule.get(mod)!.add(impact.path);
  }

  const result: ModuleImpact[] = [];
  for (const [mod, impactedFiles] of impactedByModule) {
    const total = moduleFileCount.get(mod) ?? impactedFiles.size;
    let level: "full" | "partial" | "minimal";

    if (impactedFiles.size === total) {
      level = "full";
    } else if (impactedFiles.size === 1 && total > 3) {
      level = "minimal";
    } else {
      level = "partial";
    }

    result.push({ name: mod, impact_level: level });
  }

  return result;
}

/**
 * §5 Step 5: map impacted files to services via project_topology.modules
 * where type === "service".
 *  "full"    -> entry point of the service impacted
 *  "partial" -> internal service file impacted (not entry point)
 *  "minimal" -> only utility file within service impacted
 */
export function aggregateServiceImpact(
  impacts: FileImpact[],
  topology: ProjectTopology | null,
  fileIndex: FileIndexEntry[],
): ServiceImpact[] {
  if (!topology) return [];

  const entryPoints = new Set(topology.entry_points.map((e) => e.path));
  const impactedPaths = new Set(impacts.map((i) => i.path));

  const result: ServiceImpact[] = [];

  for (const mod of topology.modules) {
    if (mod.type !== "service") continue;

    // Determine files belonging to this service module
    const moduleFiles = fileIndex.filter((f) => f.module === mod.name).map((f) => f.path);
    const impactedInModule = moduleFiles.filter((p) => impactedPaths.has(p));

    if (impactedInModule.length === 0) continue;

    let level: "full" | "partial" | "minimal";
    if (impactedInModule.some((p) => entryPoints.has(p))) {
      level = "full";
    } else if (impactedInModule.length === 1) {
      level = "minimal";
    } else {
      level = "partial";
    }

    result.push({ name: mod.name, impact_level: level });
  }

  return result;
}
