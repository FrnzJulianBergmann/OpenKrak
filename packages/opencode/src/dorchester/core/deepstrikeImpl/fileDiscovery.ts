// engine/core/deepstrikeImpl/fileDiscovery.ts
// Step 1 — File Discovery
// deepstrike.md §5.1 step 1: Walk repo tree, filter by extension.

import { glob } from "glob";
import path from "path";
import fs from "fs/promises";

export const SUPPORTED_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"];

export async function discoverFiles(repoRoot: string): Promise<string[]> {
  const patterns = SUPPORTED_EXTENSIONS.map((ext) => `**/*${ext}`);
  const files = await glob(patterns, {
    cwd: repoRoot,
    absolute: false,
    ignore: ["**/node_modules/**", "**/dist/**", "**/build/**", "**/.git/**", "**/*.d.ts"],
  });
  return files.map((f) => f.replace(/\\/g, "/")).sort(); // deterministic; glob returns backslash paths on Windows, normalize to POSIX-style so downstream regex/split('/') logic works cross-platform
}

export async function readFileContent(absPath: string): Promise<string> {
  return fs.readFile(absPath, "utf-8");
}

export function toAbsPath(repoRoot: string, relPath: string): string {
  return path.join(repoRoot, relPath);
}
