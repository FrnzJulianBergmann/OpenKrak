// engine/core/deepstrikeImpl/index.ts
// DeepStrike – Repository Intelligence Layer
// deepstrike.md §1 Mission + §5.1 Pipeline Steps
// Constitution Rule 3: Pure deterministic. No AI calls.
// Writes to MahadataStore only – no direct return of data to other components.

import type { MahadataStore, Repository, DependencyNode, Finding, FileIndexEntry } from "../../contracts/index.js";
import { createLogger } from "../../shared/logger/index.js";
import { discoverFiles, readFileContent, toAbsPath } from "./fileDiscovery.js";
import { hashContent } from "./contentHash.js";
import { parseFile } from "./astParser.js";
import { discoverSymbols } from "./symbolDiscovery.js";
import { extractRawEdges, extractBarrelReExports } from "./dependencyResolver.js";
import { assembleGraph } from "./graphAssembly.js";
import {
  detectCycles,
  detectDeadCode,
  detectMissingSymbols,
  buildCycleFindings,
  detectSecurityPatterns,
} from "./structuralAnalysis.js";
import { classifyTopology } from "./topologyClassifier.js";
import { buildFileIndexEntry } from "./fileIndexBuilder.js";
import { extractCyclomaticComplexity } from "./complexityExtractor.js";
import { loadParseCache } from "./parseCache.js";
import path from "path";
import fs from "fs/promises";

const logger = createLogger("deepstrike");

export interface DeepStrikeOptions {
  repoRoot: string;
  previousFileIndex?: { path: string; content_hash: string }[];
}

export interface DeepStrikeResult {
  status: "success" | "partial" | "failed";
  files_processed: number;
  files_skipped: number;
  cache_hits: number;
  nodes_emitted: number;
  edges_emitted: number;
  findings_emitted: number;
  duration_ms: number;
  errors: string[];
}

export async function runDeepStrike(
  store: MahadataStore,
  opts: DeepStrikeOptions,
): Promise<DeepStrikeResult> {
  const start = Date.now();
  const scanId = store.getMeta().scan_id;
  const log = logger.child({ scan_id: scanId });
  const errors: string[] = [];

  log.info({ event: "deepstrike.start", repo_root: opts.repoRoot }, "DeepStrike started");

  // -- AST Parse Cache (persistent disk cache, keyed by file path + content_hash)
  const parseCache = await loadParseCache(opts.repoRoot);

  // -- Step 1: File Discovery
  const relFiles = await discoverFiles(opts.repoRoot);
  log.info({ event: "file_discovery.complete", count: relFiles.length }, "Files discovered");

  // -- Step 2: Incremental Check
  const prevHashMap = new Map(
    (opts.previousFileIndex ?? []).map((e) => [e.path, e.content_hash]),
  );

  const allNodes: DependencyNode[] = [];
  const allRawEdges: ReturnType<typeof extractRawEdges> = [];
  const allBarrelReExports: ReturnType<typeof extractBarrelReExports> = [];
  const fileIndexEntries: FileIndexEntry[] = [];
  const allFindings: Finding[] = [];
  let skipped = 0;

  // -- Steps 3-5: Parse, Symbols, Edges (per file)
  for (const relPath of relFiles) {
    const absPath = toAbsPath(opts.repoRoot, relPath);
    let content: string;
    try {
      content = await readFileContent(absPath);
    } catch (e) {
      errors.push(`read error: ${relPath}`);
      continue;
    }

    const currentHash = hashContent(content);
    if (prevHashMap.get(relPath) === currentHash) {
      skipped++;
      continue;
    }

    // Step 3: AST Parse with persistent cache
    let symbols: DependencyNode[];
    let rawEdges: ReturnType<typeof extractRawEdges>;
    let curBarrelReExports: ReturnType<typeof extractBarrelReExports>;

    const cached = parseCache.get(absPath, currentHash);
    // ast is retained from cache miss so complexity extraction can reuse it (avoids double-parse)
    let cachedAst: ReturnType<typeof parseFile>["ast"] | null = null;
    if (cached) {
      // Cache hit - skip re-parsing entirely
      symbols = cached.nodes as DependencyNode[];
      rawEdges = cached.edges as ReturnType<typeof extractRawEdges>;
      curBarrelReExports = [];
    } else {
      // Cache miss - parse once, reuse ast for both symbol discovery and complexity
      const { ast } = parseFile(absPath, content, opts.repoRoot);
      cachedAst = ast;
      symbols = discoverSymbols(relPath, ast);
      const fileNodeId = symbols.find((n) => n.kind === "file")?.id ?? (relPath + "::file::0");
      rawEdges = extractRawEdges(relPath, ast, fileNodeId);
      curBarrelReExports = extractBarrelReExports(relPath, ast);
      parseCache.set(absPath, {
        content_hash: currentHash,
        nodes: symbols,
        edges: rawEdges,
        file_index: {} as any,
      });
    }

    // Attach content_hash to all nodes
    for (const s of symbols) s.content_hash = currentHash;
    allNodes.push(...symbols);

    const fileNodeId = symbols.find((n) => n.kind === "file")?.id ?? (relPath + "::file::0");
    allRawEdges.push(...rawEdges);
    allBarrelReExports.push(...curBarrelReExports);

    // Security pattern scan
    const secFindings = detectSecurityPatterns(relPath, content);
    allFindings.push(...secFindings);

    // File index entry + complexity
    try {
      const partialEntry = await buildFileIndexEntry(opts.repoRoot, relPath, content, symbols.length);
      const astForComplexity = cachedAst ?? parseFile(absPath, content, opts.repoRoot).ast;
      const cyclomaticByFunc = extractCyclomaticComplexity(astForComplexity, relPath);
      const entry: FileIndexEntry = {
        ...partialEntry,
        complexity: {
          cyclomatic: cyclomaticByFunc.size > 0 ? Math.max(...cyclomaticByFunc.values()) : null,
          cognitive: null,
          loc: content.split("\n").length,
        },
      };
      fileIndexEntries.push(entry);
    } catch (e) {
      errors.push(`file_index error: ${relPath}`);
    }
  }

  // Save cache to disk (non-blocking to overall pipeline)
  parseCache.save().catch(() => {});

  log.info(
    { event: "cache.stats", hits: parseCache.hitCount, misses: parseCache.missCount },
    "Parse cache stats",
  );

  // -- Step 6: Graph Assembly
  const graph = assembleGraph(allNodes, allRawEdges, allBarrelReExports);

  // -- Step 7: Structural Analysis
  const { cyclePaths, detected } = detectCycles(graph);
  graph.stats.cycles_detected = detected;
  graph.stats.cycle_paths = cyclePaths;

  const cycleFindings = buildCycleFindings(cyclePaths, allNodes);
  allFindings.push(...cycleFindings);

  const knownIds = new Set(allNodes.map((n) => n.id));
  const missingFindings = detectMissingSymbols(graph, knownIds);
  allFindings.push(...missingFindings);

  const deadFindings = detectDeadCode(graph, fileIndexEntries);
  allFindings.push(...deadFindings);

  // -- Step 8: Project Topology
  const topology = await classifyTopology(opts.repoRoot, relFiles);

  // -- Step 9: Write to MahadataStore
  const repoName = path.basename(opts.repoRoot);
  const repository: Repository = {
    name: repoName,
    path: opts.repoRoot,
    remote_url: null,
    primary_language: "typescript",
    languages: [{ name: "typescript", percentage: 100 }],
    framework: null,
    total_files: relFiles.length,
    total_loc: fileIndexEntries.reduce((s, e) => s + e.loc, 0),
    git: { current_branch: null, last_commit_hash: null, last_commit_at: null, is_dirty: false },
  };

  store.setRepository(repository);
  store.setProjectTopology(topology);
  store.setDependencyGraph(graph);
  store.setFileIndex(fileIndexEntries);
  store.addFindings(allFindings);

  const duration = Date.now() - start;
  log.info(
    {
      event: "deepstrike.complete",
      files_processed: relFiles.length - skipped,
      files_skipped: skipped,
      cache_hits: parseCache.hitCount,
      nodes: allNodes.length,
      edges: graph.edges.length,
      findings: allFindings.length,
      duration_ms: duration,
      errors: errors.length,
    },
    "DeepStrike complete",
  );

  return {
    status: errors.length > 0 ? "partial" : "success",
    files_processed: relFiles.length - skipped,
    files_skipped: skipped,
    cache_hits: parseCache.hitCount,
    nodes_emitted: allNodes.length,
    edges_emitted: graph.edges.length,
    findings_emitted: allFindings.length,
    duration_ms: duration,
    errors,
  };
}


