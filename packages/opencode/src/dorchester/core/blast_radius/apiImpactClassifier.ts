// engine/core/blast_radius/apiImpactClassifier.ts
// Blast Radius Engine — Step 6: API Impact Classifier
// blast_radius_engine.md §5 Step 6
// Constitution Rule 3: Pure deterministic. No AI.

import type { DependencyGraph, FileIndexEntry } from "../../contracts/index.js";
import type { FileImpact } from "./impactCalculator.js";

export interface ApiImpact {
  endpoint: string;
  impact_level: "breaking" | "non_breaking" | "unknown";
}

const ROUTE_PATTERNS = [/\/routes\//, /\/controllers\//, /\/handlers\//, /\/api\//];

function isRouteFile(path: string): boolean {
  return ROUTE_PATTERNS.some((p) => p.test(path));
}

/**
 * §5 Step 6:
 *  "breaking"     -> trigger is interface/type used by endpoint, OR trigger IS the endpoint file
 *  "non_breaking" -> trigger is implementation detail (not interface)
 *  "unknown"      -> cannot determine from graph alone
 *
 * triggerIsInterface: true if the trigger file exports interface/type_alias.
 */
export function classifyApiImpact(
  triggerFile: string,
  triggerIsInterface: boolean,
  impacts: FileImpact[],
  fileIndex: FileIndexEntry[],
  graph: DependencyGraph,
): ApiImpact[] {
  const routeFileSet = new Set(
    fileIndex.filter((f) => f.role === "source" && isRouteFile(f.path)).map((f) => f.path),
  );

  const apiImpacts: ApiImpact[] = [];

  // Trigger file is itself a route/endpoint file
  if (routeFileSet.has(triggerFile)) {
    const handlerName = handlerNameFor(triggerFile, graph);
    apiImpacts.push({
      endpoint: handlerName ?? triggerFile,
      impact_level: "breaking",
    });
  }

  for (const impact of impacts) {
    if (!routeFileSet.has(impact.path)) continue;
    const handlerName = handlerNameFor(impact.path, graph);
    const endpoint = handlerName ?? impact.path;

    let level: "breaking" | "non_breaking" | "unknown";
    if (triggerIsInterface) {
      level = "breaking";
    } else if (impact.impact_type === "direct") {
      level = "non_breaking";
    } else {
      level = "unknown";
    }

    apiImpacts.push({ endpoint, impact_level: level });
  }

  return apiImpacts;
}

function handlerNameFor(filePath: string, graph: DependencyGraph): string | null {
  const fnNode = graph.nodes.find(
    (n) => n.file === filePath && (n.kind === "function" || n.kind === "method") && n.is_exported,
  );
  return fnNode ? `${filePath}::${fnNode.name}` : null;
}
