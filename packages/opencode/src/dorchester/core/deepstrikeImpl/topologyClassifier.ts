// engine/core/deepstrikeImpl/topologyClassifier.ts
// Step 8 — Project Topology Classification
// deepstrike.md §5.1 step 8: heuristic from folder + package.json

import type { ProjectTopology } from "../../contracts/index.js";
import fs from "fs/promises";
import path from "path";

export async function classifyTopology(
  repoRoot: string,
  allFiles: string[],
): Promise<ProjectTopology> {
  const type = await detectProjectType(repoRoot);
  const entryPoints = detectEntryPoints(allFiles);
  const layers = detectLayers(allFiles);
  const modules = detectModules(allFiles);

  return { type, entry_points: entryPoints, layers, modules };
}

async function detectProjectType(repoRoot: string): Promise<ProjectTopology["type"]> {
  try {
    const pkgPath = path.join(repoRoot, "package.json");
    const pkg = JSON.parse(await fs.readFile(pkgPath, "utf-8"));
    if (pkg.workspaces) return "monorepo";
    if (pkg.private === true && Array.isArray(pkg.workspaces)) return "monorepo";
  } catch { /* no package.json */ }

  // Check for nx/lerna
  for (const config of ["nx.json", "lerna.json"]) {
    try {
      await fs.access(path.join(repoRoot, config));
      return "monorepo";
    } catch { /* not found */ }
  }

  return "monolith";
}

function detectEntryPoints(files: string[]): ProjectTopology["entry_points"] {
  const entries: ProjectTopology["entry_points"] = [];
  for (const f of files) {
    if (/\/(index|main|app|server|cli)\.(ts|js)x?$/.test(f)) {
      const type = f.includes("cli") ? "cli"
        : f.includes("server") || f.includes("app") ? "api"
        : "main";
      entries.push({ path: f, type });
    }
  }
  return entries;
}

function detectLayers(files: string[]): ProjectTopology["layers"] {
  const layerMap: Record<string, string[]> = {};
  const layerPatterns: [string, RegExp][] = [
    ["domain", /\/(domain|entities|models)\//],
    ["application", /\/(application|usecases|services)\//],
    ["infrastructure", /\/(infrastructure|infra|repositories|adapters)\//],
    ["presentation", /\/(presentation|controllers|routes|handlers|api)\//],
    ["shared", /\/(shared|common|utils|helpers)\//],
  ];
  for (const f of files) {
    for (const [layer, pattern] of layerPatterns) {
      if (pattern.test(f)) {
        if (!layerMap[layer]) layerMap[layer] = [];
        layerMap[layer]!.push(f);
        break;
      }
    }
  }
  return Object.entries(layerMap).map(([name, paths]) => ({ name, paths }));
}

function detectModules(files: string[]): ProjectTopology["modules"] {
  const moduleMap = new Map<string, string[]>();
  for (const f of files) {
    const parts = f.split("/");
    if (parts.length >= 2) {
      const mod = parts[0]!;
      if (!moduleMap.has(mod)) moduleMap.set(mod, []);
      moduleMap.get(mod)!.push(f);
    }
  }
  return [...moduleMap.entries()].map(([name, modFiles]) => ({
    name,
    path: name,
    type: name.includes("test") ? "test" : "service",
    responsibility: `Module: ${name} (${modFiles.length} files)`,
  }));
}
