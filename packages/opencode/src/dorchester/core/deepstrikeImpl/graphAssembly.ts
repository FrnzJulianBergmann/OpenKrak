// engine/core/deepstrikeImpl/graphAssembly.ts
// Step 6 — Graph Assembly
// deepstrike.md §5.1 step 6
// Assembles nodes + edges into final DependencyGraph.
// Handles: barrel dual-edge pattern (§4.1.3), node_id resolution, dedup.

import type {
  DependencyGraph,
  DependencyNode,
  DependencyEdge,
} from "../../contracts/index.js";
import type { RawEdge, BarrelReExport } from "./dependencyResolver.js";

export function assembleGraph(
  allNodes: DependencyNode[],
  rawEdges: RawEdge[],
  barrelReExports: BarrelReExport[] = [],
): DependencyGraph {
  // Normalize all node IDs and file paths to forward slash
  for (const node of allNodes) {
    node.id = node.id.replace(/\\/g, "/");
    node.file = node.file.replace(/\\/g, "/");
  }
  for (const raw of rawEdges) {
    raw.from = raw.from.replace(/\\/g, "/");
    raw.to = raw.to.replace(/\\/g, "/");
    raw.file = raw.file.replace(/\\/g, "/");
  }
  for (const re of barrelReExports) {
    re.barrelFile = re.barrelFile.replace(/\\/g, "/");
    re.sourceFile = re.sourceFile.replace(/\\/g, "/");
  }
  // Build node lookup by file path (for barrel resolution)
  const nodeById = new Map<string, DependencyNode>();
  for (const node of allNodes) {
    nodeById.set(node.id, node);
  }

  // Build file-level node lookup: file path → file node_id
  const fileNodeMap = new Map<string, string>();
  for (const node of allNodes) {
    if (node.kind === "file") {
      fileNodeMap.set(node.file, node.id);
    }
  }

  // Build barrel map: barrelFile → sourceFile[]
  // For wildcard re-exports, barrelFile → all nodes from sourceFile
  const barrelToSources = new Map<string, string[]>();
  for (const re of barrelReExports) {
    const existing = barrelToSources.get(re.barrelFile) ?? [];
    if (!existing.includes(re.sourceFile)) existing.push(re.sourceFile);
    barrelToSources.set(re.barrelFile, existing);
  }

  // Build: sourceFile → primary exported class/interface node_id
  // (first non-file exported node, or first non-file node)
  const filePrimaryExport = new Map<string, string>();
  for (const node of allNodes) {
    if (node.kind === "file") continue;
    if (!filePrimaryExport.has(node.file)) {
      filePrimaryExport.set(node.file, node.id);
    }
    // Prefer class/interface over methods
    if ((node.kind === "class" || node.kind === "interface") && node.is_exported) {
      filePrimaryExport.set(node.file, node.id);
    }
  }

  const edges: DependencyEdge[] = [];
  const edgeSet = new Set<string>(); // dedup

  function addEdge(edge: DependencyEdge) {
    if (!edgeSet.has(edge.id)) {
      edgeSet.add(edge.id);
      edges.push(edge);
    }
  }

  for (const raw of rawEdges) {
    // Resolve `to` to a proper node_id if it's a file path
    // For barrel files, resolve to their variable/default node (::default::1) not file::0
    const resolvedTo = resolveToNodeId(raw.to, fileNodeMap, nodeById);

    const edgeId = `${raw.from}->${resolvedTo}:${raw.kind}`;
    const edge: DependencyEdge = {
      id: edgeId,
      from: raw.from,
      to: resolvedTo,
      kind: raw.kind,
      file: raw.file,
      line: raw.line,
      is_dynamic: raw.is_dynamic,
      is_barrel_import: raw.is_barrel_import,
      resolved_via: raw.resolved_via,
    };

    addEdge(edge);

    // Barrel dual-edge (§4.1.3):
    // For each import that targets a barrel file, emit re_export_resolved
    // edges from the same `from` node to each actual exported symbol.
    if (raw.is_barrel_import && raw.kind === "import") {
      // resolvedTo is the barrel file node_id, extract file path
      const barrelNode = nodeById.get(resolvedTo);
      const barrelFilePath = barrelNode?.file ?? resolvedTo.split("::")[0];

      const sourceFiles = barrelToSources.get(barrelFilePath) ?? [];

      if (sourceFiles.length > 0) {
        for (const sourceFile of sourceFiles) {
          const primaryExportId = filePrimaryExport.get(sourceFile);
          if (primaryExportId) {
            const reEdgeId = `${raw.from}->${primaryExportId}:re_export_resolved`;
            addEdge({
              id: reEdgeId,
              from: raw.from,
              to: primaryExportId,
              kind: "re_export_resolved",
              file: raw.file,
              line: raw.line,
              is_dynamic: false,
              is_barrel_import: true,
              resolved_via: resolvedTo,
            });
          }
        }
      } else {
        // No barrel map entry — fallback: emit re_export_resolved to barrel node itself
        const reEdgeId = `${raw.from}->${resolvedTo}:re_export_resolved`;
        addEdge({
          id: reEdgeId,
          from: raw.from,
          to: resolvedTo,
          kind: "re_export_resolved",
          file: raw.file,
          line: raw.line,
          is_dynamic: false,
          is_barrel_import: true,
          resolved_via: resolvedTo,
        });
      }
    }
  }

  // Add barrel-to-source file edges for cycle detection
  // e.g. services/index.ts::file::0 → services/EmailService.ts::file::0
  for (const [barrelFile, sourceFiles] of barrelToSources) {
    const barrelFileNodeId = fileNodeMap.get(barrelFile);
    if (!barrelFileNodeId) continue;
    for (const sourceFile of sourceFiles) {
      const sourceFileNodeId = fileNodeMap.get(sourceFile);
      if (!sourceFileNodeId) continue;
      const eid = `${barrelFileNodeId}->${sourceFileNodeId}:barrel_source`;
      addEdge({ id: eid, from: barrelFileNodeId, to: sourceFileNodeId, kind: "re_export_resolved",
        file: barrelFile, line: 0, is_dynamic: false, is_barrel_import: true, resolved_via: barrelFileNodeId });
    }
  }

  // Post-process: resolve bare call targets to method node_ids
  // e.g. "findByToken" → "repositories/sessionrepository.ts::SessionRepository.findByToken::7"
  const methodByName = new Map<string, DependencyNode[]>();
  for (const node of allNodes) {
    if (node.kind === "method") {
      const shortName = node.name.split(".").pop() ?? node.name;
      const arr = methodByName.get(shortName) ?? [];
      arr.push(node);
      methodByName.set(shortName, arr);
    }
  }

  for (const edge of edges) {
    if (edge.kind !== "call") continue;
    if (edge.to.includes("::")) continue;
    const candidates = methodByName.get(edge.to) ?? [];
    if (candidates.length === 1) {
      edge.to = candidates[0].id;
      edge.id = `${edge.from}->${edge.to}:call`;
    } else if (candidates.length > 1) {
      // Multiple candidates: resolve via importer relationship
      // Find which files the from-node's file imports
      const fromFile = edge.from.split("::")[0];
      const importedFiles = new Set(
        edges
          .filter(e => (e.kind === "import" || e.kind === "re_export_resolved") && e.from.startsWith(fromFile))
          .map(e => e.to.split("::")[0])
      );
      const fromClassName = edge.from.split("::")[1]?.split(".")[0] ?? "";
      // Find the class-level node for this method's class
      const fromClassNodeId = allNodes.find(
        n => n.kind === "class" && n.file === fromFile && n.name === fromClassName
      )?.id;
      // Prefer candidate imported directly by the class node (not method nodes)
      const classLevelImportFiles = fromClassNodeId ? new Set(
        edges
          .filter(e => e.kind === "re_export_resolved" && e.from === fromClassNodeId)
          .map(e => e.to.split("::")[0])
      ) : new Set<string>();
      const best = (classLevelImportFiles.size > 0 ? candidates.find(c => classLevelImportFiles.has(c.file)) : undefined) ??
        candidates.find(c => importedFiles.has(c.file));
      if (best) {
        edge.to = best.id;
        edge.id = `${edge.from}->${edge.to}:call`;
      }
    }
  }
  // Dedup after resolution
  const finalEdgeSet = new Set<string>();
  const finalEdges: DependencyEdge[] = [];
  for (const e of edges) {
    if (!finalEdgeSet.has(e.id)) { finalEdgeSet.add(e.id); finalEdges.push(e); }
  }

  const stats = computeStats(allNodes, finalEdges);
  return { nodes: allNodes, edges: finalEdges, stats };
}

function resolveToNodeId(to: string, fileNodeMap: Map<string, string>, nodeById?: Map<string, DependencyNode>): string {
  const fileNodeId = fileNodeMap.get(to) ?? fileNodeMap.get(to + ".ts");
  if (fileNodeId && nodeById) {
    const filePath = fileNodeId.split("::")[0];
    // Prefer barrel variable node (::default::1) for barrel files
    const barrelNode = [...nodeById.values()].find(
      n => n.file === filePath && n.kind === "variable" && n.name === "default"
    );
    if (barrelNode) return barrelNode.id;
    // Prefer primary class node for non-barrel files
    const classNodes = [...nodeById.values()].filter(
      n => n.file === filePath && n.kind === "class"
    );
    if (classNodes.length === 1) return classNodes[0].id;
    return fileNodeId;
  }
  if (fileNodeId) return fileNodeId;
  return to;
}

function computeStats(
  nodes: DependencyNode[],
  edges: DependencyEdge[],
): DependencyGraph["stats"] {
  const kindBreakdown: Record<string, number> = {};
  for (const n of nodes) {
    kindBreakdown[n.kind] = (kindBreakdown[n.kind] ?? 0) + 1;
  }

  const edgeBreakdown: Record<string, number> = {};
  for (const e of edges) {
    edgeBreakdown[e.kind] = (edgeBreakdown[e.kind] ?? 0) + 1;
  }

  return {
    total_nodes: nodes.length,
    total_edges: edges.length,
    max_depth: 0, // computed in structuralAnalysis
    cycles_detected: false,
    cycle_paths: [],
    node_kind_breakdown: kindBreakdown,
    edge_kind_breakdown: edgeBreakdown,
  };
}
