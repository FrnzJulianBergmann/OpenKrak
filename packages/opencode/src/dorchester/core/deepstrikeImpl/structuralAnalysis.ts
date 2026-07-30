// engine/core/deepstrikeImpl/structuralAnalysis.ts
// Step 7 — Structural Analysis
// deepstrike.md §5.1 step 7 + §6 severity rules + §6.1 security pattern registry

import type {
  DependencyGraph,
  DependencyNode,
  DependencyEdge,
  Finding,
  FindingSeverity,
} from "../../contracts/index.js";
import { randomUUID } from "crypto";

// ─── Cycle Detection (DFS) ───────────────────────────────
export function detectCycles(graph: DependencyGraph): { cyclePaths: string[][]; detected: boolean } {
  const adjMap = new Map<string, string[]>();

  // Build adjacency from all structural edges
  for (const edge of graph.edges) {
    if (!adjMap.has(edge.from)) adjMap.set(edge.from, []);
    adjMap.get(edge.from)!.push(edge.to);
  }

  // Add implicit edges: file node -> all non-file nodes in same file
  // This ensures file::0 and class nodes are connected for cycle detection
  const fileToNodes = new Map<string, string[]>();
  for (const node of graph.nodes) {
    if (node.kind === 'file') continue;
    const fileId = node.file + '::file::0';
    if (!fileToNodes.has(fileId)) fileToNodes.set(fileId, []);
    fileToNodes.get(fileId)!.push(node.id);
  }
  for (const [fileNodeId, memberIds] of fileToNodes) {
    if (!adjMap.has(fileNodeId)) adjMap.set(fileNodeId, []);
    for (const mid of memberIds) adjMap.get(fileNodeId)!.push(mid);
    // No reverse edge — would create false cycles
  }

  const visited = new Set<string>();
  const inStack = new Set<string>();
  const cyclePaths: string[][] = [];

  function dfs(nodeId: string, path: string[]): void {
    visited.add(nodeId);
    inStack.add(nodeId);
    path.push(nodeId);

    for (const neighbor of adjMap.get(nodeId) ?? []) {
      if (!visited.has(neighbor)) {
        dfs(neighbor, [...path]);
      } else if (inStack.has(neighbor)) {
        // Found cycle
        const cycleStart = path.indexOf(neighbor);
        if (cycleStart !== -1) {
          cyclePaths.push([...path.slice(cycleStart), neighbor]);
        }
      }
    }

    inStack.delete(nodeId);
  }

  for (const node of graph.nodes) {
    if (!visited.has(node.id)) {
      dfs(node.id, []);
    }
  }

  return { cyclePaths, detected: cyclePaths.length > 0 };
}

// ─── Dead Code Detection ─────────────────────────────────
export function detectDeadCode(
  graph: DependencyGraph,
  fileIndex: { path: string; role: string; is_entry_point: boolean }[],
): Finding[] {
  const incomingCount = new Map<string, number>();
  for (const node of graph.nodes) incomingCount.set(node.id, 0);
  for (const edge of graph.edges) {
    incomingCount.set(edge.to, (incomingCount.get(edge.to) ?? 0) + 1);
  }

  const testFiles = new Set(fileIndex.filter((f) => f.role === "test").map((f) => f.path));
  const entryPoints = new Set(
    graph.nodes.filter((n) => n.is_entry_point).map((n) => n.id),
  );

  const findings: Finding[] = [];

  for (const node of graph.nodes) {
    if (node.kind === "file") continue; // skip file-level nodes
    const incoming = incomingCount.get(node.id) ?? 0;
    if (incoming === 0 && !entryPoints.has(node.id) && !testFiles.has(node.file)) {
      const isExported = node.is_exported;
      findings.push({
        id: randomUUID(),
        type: "dead_code",
        severity: isExported ? "low" : "medium",
        file: node.file,
        line_start: node.line_start,
        line_end: node.line_end,
        symbol: node.id,
        title: `Dead code: ${node.name}`,
        description: `Symbol '${node.name}' has no incoming references and is not an entry point.`,
        raw_data: { incoming_edge_count: 0, last_referenced_at: null },
        source_component: "deepstrike",
        is_structural: true,
      });
    }
  }

  return findings;
}

// ─── Missing Symbol Detection ────────────────────────────
export function detectMissingSymbols(
  graph: DependencyGraph,
  knownNodeIds: Set<string>,
): Finding[] {
  const findings: Finding[] = [];
  for (const edge of graph.edges) {
    if (edge.kind !== "import") continue;
    // External packages (no "/" prefix, no ".") are intentionally skipped
    if (!edge.to.includes("/") && !edge.to.startsWith(".")) continue;
    if (!knownNodeIds.has(edge.to)) {
      findings.push({
        id: randomUUID(),
        type: "missing_symbol",
        severity: "high",
        file: edge.file,
        line_start: edge.line,
        line_end: edge.line,
        symbol: null,
        title: `Unresolved import: ${edge.to}`,
        description: `Import target '${edge.to}' could not be resolved in the dependency graph.`,
        raw_data: {
          import_statement: edge.to,
          attempted_resolution: edge.to,
        },
        source_component: "deepstrike",
        is_structural: true,
      });
    }
  }
  return findings;
}

// ─── Circular Dependency Findings ───────────────────────
export function buildCycleFindings(
  cyclePaths: string[][],
  nodes: DependencyNode[],
): Finding[] {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  return cyclePaths.map((cycle) => {
    const firstNode = nodeMap.get(cycle[0]);
    const isEntryInvolved = cycle.some((id) => nodeMap.get(id)?.is_entry_point);
    const severity: FindingSeverity = isEntryInvolved ? "high" : "medium";
    return {
      id: randomUUID(),
      type: "circular_dependency" as const,
      severity,
      file: firstNode?.file ?? "unknown",
      line_start: firstNode?.line_start ?? null,
      line_end: null,
      symbol: cycle[0],
      title: `Circular dependency (${cycle.length} nodes)`,
      description: `Cycle: ${cycle.slice(0, 3).join(" → ")}${cycle.length > 3 ? " ..." : ""}`,
      raw_data: { cycle_path: cycle, cycle_length: cycle.length },
      source_component: "deepstrike" as const,
      is_structural: true,
    };
  });
}

// ─── Security Pattern Registry §6.1 ─────────────────────
const SECURITY_PATTERNS: {
  pattern_id: string;
  pattern_name: string;
  regex: RegExp;
  severity: FindingSeverity;
  cve_reference: string | null;
}[] = [
  {
    pattern_id: "SEC-001",
    pattern_name: "Dynamic Code Evaluation",
    regex: /\beval\s*\(|new\s+Function\s*\(/g,
    severity: "high",
    cve_reference: null,
  },
  {
    pattern_id: "SEC-002",
    pattern_name: "Unsafe Child Process",
    regex: /child_process\.(exec|execSync)\s*\(/g,
    severity: "high",
    cve_reference: null,
  },
  {
    pattern_id: "SEC-003",
    pattern_name: "Hardcoded Credential Pattern",
    regex: /(api_?key|secret|password|token)\s*=\s*["'][A-Za-z0-9+/=_\-]{8,}/gi,
    severity: "high",
    cve_reference: null,
  },
  {
    pattern_id: "SEC-004",
    pattern_name: "Insecure Deserialization",
    regex: /JSON\.parse\s*\(/g,
    severity: "medium",
    cve_reference: null,
  },
  {
    pattern_id: "SEC-005",
    pattern_name: "Disabled TLS Verification",
    regex: /rejectUnauthorized\s*:\s*false/g,
    severity: "high",
    cve_reference: null,
  },
];

// SEC-004 (JSON.parse) only matters when the parsed result flows into a
// dangerous sink shortly after -- eval/Function, dynamic require, or
// __proto__ access. JSON.parse() on its own is safe (data-only, no code
// execution), so flagging every JSON.parse() call is a high-false-positive
// heuristic. We check a small window of source after each match instead of
// removing the rule outright, since the sink pattern IS genuinely dangerous.
const SEC004_SINK_RE = /\beval\s*\(|new\s+Function\s*\(|require\s*\(\s*[a-zA-Z_$]|__proto__/;
const SEC004_WINDOW_CHARS = 300;

export function detectSecurityPatterns(filePath: string, content: string): Finding[] {
  const findings: Finding[] = [];
  for (const pattern of SECURITY_PATTERNS) {
    const matches = [...content.matchAll(pattern.regex)];
    for (const match of matches) {
      if (pattern.pattern_id === "SEC-004") {
        const windowEnd = Math.min(content.length, match.index + match[0].length + SEC004_WINDOW_CHARS);
        const window = content.slice(match.index + match[0].length, windowEnd);
        if (!SEC004_SINK_RE.test(window)) continue; // JSON.parse() stands alone -- not flagged
      }
      const lineNum = content.slice(0, match.index).split("\n").length;
      findings.push({
        id: randomUUID(),
        type: "security_pattern",
        severity: pattern.severity,
        file: filePath,
        line_start: lineNum,
        line_end: lineNum,
        symbol: null,
        title: `Security: ${pattern.pattern_name}`,
        description: `Pattern '${pattern.pattern_name}' detected at line ${lineNum}.`,
        raw_data: {
          pattern_id: pattern.pattern_id,
          pattern_name: pattern.pattern_name,
          matched_text: match[0],
          cve_reference: pattern.cve_reference,
        },
        source_component: "deepstrike",
        is_structural: true,
      });
    }
  }
  return findings;
}
