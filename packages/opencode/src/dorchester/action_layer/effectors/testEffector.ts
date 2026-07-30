// engine/action_layer/effectors/testEffector.ts
// action_layer.md §3.4 — execa, command whitelist

import { execa } from "execa";
import { TestEffectorError } from "../types.js";
import type { Effector, ExecutionContext, ValidationResult } from "../types.js";
import type { TestRunParams } from "../../action_contracts/index.js";

const TEST_COMMAND_WHITELIST = [
  "jest", "vitest", "mocha", "pytest", "go", "cargo", "mvn", "gradle",
  "npm", "yarn", "pnpm", "npx",
];

export class TestRunEffector implements Effector<TestRunParams, { exit_code: number; output: string }> {
  readonly type = "test_run" as const;

  validate(params: TestRunParams): ValidationResult {
    const errors: string[] = [];
    const base = params.command?.split(" ")[0];
    if (!base || !TEST_COMMAND_WHITELIST.includes(base)) {
      errors.push(`command not in whitelist: ${params.command}`);
    }
    if ((params.timeout_ms ?? 60000) > 300000) {
      errors.push("timeout_ms exceeds 300000 (5 minutes)");
    }
    return { valid: errors.length === 0, errors };
  }

  async execute(params: TestRunParams, ctx: ExecutionContext) {
    const { valid, errors } = this.validate(params);
    if (!valid) throw new TestEffectorError(errors.join("; "));

    try {
      const result = await execa(params.command, params.args ?? [], {
        cwd: params.working_dir ?? ctx.repo_root,
        timeout: params.timeout_ms ?? 60000,
        reject: false,
      });

      const failOnFailure = params.fail_on_test_failure ?? true;
      if (result.exitCode !== 0 && failOnFailure) {
        throw new TestEffectorError(`Test command failed with exit code ${result.exitCode}`);
      }

      return { exit_code: result.exitCode ?? -1, output: result.stdout + result.stderr };
    } catch (err) {
      if (err instanceof TestEffectorError) throw err;
      throw new TestEffectorError(`Failed to run test command: ${(err as Error).message}`);
    }
  }

  // test_run tidak mengubah state — rollback tidak diperlukan
  async rollback(): Promise<void> {
    return;
  }
}
