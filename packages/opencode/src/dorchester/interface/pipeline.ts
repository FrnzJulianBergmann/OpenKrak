// engine/interface/pipeline.ts
// Vanguard Pipeline — Repository → Mahadata
// Menyambungkan semua 6 core components secara sequential.
// Ini adalah interface paling sederhana: satu fungsi, satu output.

import { runDeepStrike } from "../core/deepstrikeImpl/index.js";
import { runCorrelationEngine } from "../core/correlation/index.js";
import { runHotspotRegistry } from "../core/hotspot/index.js";
import { runBlastRadiusEngine } from "../core/blast_radius/index.js";
import { runExecutionGate } from "../core/execution_gate/index.js";
import { runMahadataGenerator } from "../core/mahadata/index.js";
import { InMemoryMahadataStore } from "../ports/storageImpl/InMemoryMahadataStore.js";
import { createLogger } from "../shared/index.js";

const logger = createLogger("pipeline");

export interface PipelineOptions {
  repoPath: string;
  objective?: string;
}

export interface PipelineResult {
  status: "complete" | "partial" | "failed";
  mahadata: Record<string, unknown>;
  durationMs: number;
  error?: string;
}

export async function runPipeline(options: PipelineOptions): Promise<PipelineResult> {
  const start = Date.now();
  const store = new InMemoryMahadataStore();
  const objective = options.objective ?? "Analyze repository";

  logger.info({ repoPath: options.repoPath, objective }, "Pipeline start");

  try {
    // 1. DeepStrike
    logger.info("Step 1/6: DeepStrike");
    await runDeepStrike(store, { repoRoot: options.repoPath });

    // 2. Hotspot Registry (must run before Correlation to populate coupling_issue findings)
    logger.info("Step 2/6: Hotspot Registry");
    await runHotspotRegistry(store);

    // 3. Correlation Engine
    logger.info("Step 3/6: Correlation Engine");
    await runCorrelationEngine(store);

    // 4. Blast Radius Engine
    logger.info("Step 4/6: Blast Radius Engine");
    await runBlastRadiusEngine(store);

    // 5. Execution Gate
    logger.info("Step 5/6: Execution Gate");
    await runExecutionGate(store);

    // 6. Mahadata Generator
    logger.info("Step 6/6: Mahadata Generator");
    await runMahadataGenerator(store, objective);

    const durationMs = Date.now() - start;
    logger.info({ durationMs }, "Pipeline complete");

    return {
      status: store.getMeta().status as "complete" | "partial",
      mahadata: store.snapshot(),
      durationMs,
    };
  } catch (err) {
    const durationMs = Date.now() - start;
    const error = err instanceof Error ? err.message : String(err);
    logger.error({ error, durationMs }, "Pipeline failed");
    return { status: "failed", mahadata: {}, durationMs, error };
  }
}
