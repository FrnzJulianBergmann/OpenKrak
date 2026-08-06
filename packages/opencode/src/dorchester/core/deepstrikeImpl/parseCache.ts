// engine/core/deepstrikeImpl/parseCache.ts
// Persistent disk cache for AST parse results, keyed by file path + content_hash.
// Eliminates redundant re-parsing of unchanged files across Power Mode queries.
// Cache location: ~/.opencode/dorchester-cache/
// Format: one JSON file per repo (keyed by hashed repoRoot path).

import fs from "fs/promises";
import path from "path";
import os from "os";
import { createHash } from "crypto";
import type { DependencyNode, DependencyEdge, FileIndexEntry } from "../../contracts/index.js";

export interface CachedFileResult {
  content_hash: string;
  nodes: DependencyNode[];
  edges: DependencyEdge[];
  file_index: Omit<FileIndexEntry, "complexity">;
}

export interface ParseCache {
  get(filePath: string, contentHash: string): CachedFileResult | null;
  set(filePath: string, result: CachedFileResult): void;
  save(): Promise<void>;
  hitCount: number;
  missCount: number;
}

const CACHE_DIR = path.join(os.homedir(), ".opencode", "dorchester-cache");

function repoCacheKey(repoRoot: string): string {
  return createHash("sha1").update(repoRoot).digest("hex").slice(0, 16);
}

export async function loadParseCache(repoRoot: string): Promise<ParseCache> {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  const cacheFile = path.join(CACHE_DIR, `${repoCacheKey(repoRoot)}.json`);

  let data: Record<string, CachedFileResult> = {};
  try {
    const raw = await fs.readFile(cacheFile, "utf8");
    data = JSON.parse(raw);
  } catch {
    // No cache yet — start fresh, that's fine
  }

  let hitCount = 0;
  let missCount = 0;

  return {
    hitCount,
    missCount,

    get(filePath: string, contentHash: string): CachedFileResult | null {
      const entry = data[filePath];
      if (entry && entry.content_hash === contentHash) {
        hitCount++;
        return entry;
      }
      missCount++;
      return null;
    },

    set(filePath: string, result: CachedFileResult): void {
      data[filePath] = result;
    },

    async save(): Promise<void> {
      try {
        await fs.writeFile(cacheFile, JSON.stringify(data), "utf8");
      } catch {
        // Cache save failure is non-fatal — analysis still completed
      }
    },
  };
}
