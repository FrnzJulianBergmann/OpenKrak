// engine/action_layer/dryRunGuard.ts
// Action Layer — DryRunGuard
// action_layer.md §6 (ADR-007). C-01: setiap effector wajib dibungkus ini.

import type { Logger } from "../shared/logger/index.js";

export class DryRunGuard {
  constructor(private readonly dryRun: boolean, private readonly logger: Logger) {}

  async execute<T>(description: string, action: () => Promise<T>, simulatedResult: T): Promise<T> {
    if (this.dryRun) {
      this.logger.info({ dry_run: true, action: description }, "DRY RUN — action not executed");
      return simulatedResult;
    }
    this.logger.info({ dry_run: false, action: description }, "Executing action");
    return action();
  }
}
