// engine/core/deepstrikeImpl/fileIndexBuilder.ts
// Step support: build file_index entries
// deepstrike.md §4.2

import type { FileIndexEntry } from "../../contracts/index.js";
import fs from "fs/promises";
import path from "path";
import { hashContent } from "./contentHash.js";

export async function buildFileIndexEntry(
  repoRoot: string,
  relPath: string,
  content: string,
  symbolCount: number,
): Promise<Omit<FileIndexEntry, "complexity">> {
  const absPath = path.join(repoRoot, relPath);
  const stat = await fs.stat(absPath);

  return {
    path: relPath.replace(/\\/g, "/"),
    language: inferLanguage(relPath),
    loc: content.split("\n").length,
    size_bytes: stat.size,
    content_hash: hashContent(content),
    last_modified: stat.mtime.toISOString(),
    role: inferRole(relPath),
    module: inferModule(relPath),
    is_entry_point: isEntryPoint(relPath),
    symbol_count: symbolCount,
  };
}

function inferLanguage(filePath: string): string {
  if (filePath.endsWith(".ts") || filePath.endsWith(".tsx")) return "typescript";
  if (filePath.endsWith(".js") || filePath.endsWith(".jsx")) return "javascript";
  return "unknown";
}

function inferRole(filePath: string): FileIndexEntry["role"] {
  if (/\.(spec|test)\.(ts|js)x?$/.test(filePath)) return "test";
  if (/\/__tests__\//.test(filePath)) return "test";
  if (/\/(config|configuration)\//.test(filePath)) return "config";
  if (/\.config\.(ts|js)$/.test(filePath)) return "config";
  if (/\/(docs|documentation)\//.test(filePath)) return "docs";
  if (/\/(generated|gen)\//.test(filePath)) return "generated";
  if (/\/(build|dist)\//.test(filePath)) return "build";
  return "source";
}

function inferModule(filePath: string): string | null {
  const normalized = filePath.replace(/\\/g, "/");
  const parts = normalized.split("/");
  return parts.length >= 2 ? parts[0]! : null;
}

function isEntryPoint(filePath: string): boolean {
  return /\/(index|main|app|server|cli)\.(ts|js)x?$/.test(filePath);
}
