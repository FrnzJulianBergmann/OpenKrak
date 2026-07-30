#!/usr/bin/env node
// engine/interface/cli.ts
// CLI entrypoint — jalankan pipeline dari command line.
// Usage: node cli.js <repoPath> [objective]

import { runPipeline } from "./pipeline.js";
import { writeFile } from "fs/promises";
import { resolve } from "path";

const [,, repoPath, ...objectiveWords] = process.argv;

if (!repoPath) {
  console.error("Usage: vanguard <repoPath> [objective]");
  process.exit(1);
}

const objective = objectiveWords.length > 0 ? objectiveWords.join(" ") : undefined;
const absRepoPath = resolve(repoPath);

console.log(`[Vanguard] Scanning: ${absRepoPath}`);
if (objective) console.log(`[Vanguard] Objective: ${objective}`);

const result = await runPipeline({ repoPath: absRepoPath, objective });

console.log(`[Vanguard] Status: ${result.status} (${result.durationMs}ms)`);

if (result.status === "failed") {
  console.error(`[Vanguard] Error: ${result.error}`);
  process.exit(1);
}

// Output Mahadata ke file
const outPath = resolve("mahadata_output.json");
await writeFile(outPath, JSON.stringify(result.mahadata, null, 2), "utf-8");
console.log(`[Vanguard] Mahadata saved: ${outPath}`);
