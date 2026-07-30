// engine/action_layer/effectors/shellEffector.ts
// action_layer.md §3.6 — execa, exhaustive whitelist (CRITICAL risk)

import { execa } from "execa";
import { resolveSafePath } from "../safetyChecker.js";
import { ShellEffectorError } from "../types.js";
import type { Effector, ExecutionContext, ValidationResult } from "../types.js";
import type { ShellCommandParams } from "../../action_contracts/index.js";

interface ShellCommandSpec {
  allowed_subcommands: string[];
  forbidden_args?: string[];
}

const SHELL_COMMAND_WHITELIST: Record<string, ShellCommandSpec> = {
  npm: { allowed_subcommands: ["install", "ci", "run", "build"], forbidden_args: ["--ignore-scripts"] },
  pnpm: { allowed_subcommands: ["install", "run", "build"] },
  yarn: { allowed_subcommands: ["install", "run", "build"] },
  node: { allowed_subcommands: [], forbidden_args: ["-e", "--eval"] },
  python: { allowed_subcommands: [], forbidden_args: ["-c"] },
  pip: { allowed_subcommands: ["install"] },
  make: { allowed_subcommands: [] },
  cargo: { allowed_subcommands: ["build", "run", "test"] },
  go: { allowed_subcommands: ["build", "run", "test", "mod"] },
  mvn: { allowed_subcommands: ["compile", "test", "package", "install"] },
};

export class ShellCommandEffector implements Effector<ShellCommandParams, { exit_code: number; output: string }> {
  readonly type = "shell_command" as const;

  validate(params: ShellCommandParams): ValidationResult {
    const errors: string[] = [];
    const spec = SHELL_COMMAND_WHITELIST[params.command];
    if (!spec) {
      errors.push(`command not in whitelist: ${params.command}`);
      return { valid: false, errors };
    }

    const args = params.args ?? [];
    if (spec.allowed_subcommands.length > 0) {
      const sub = args[0];
      if (!sub || !spec.allowed_subcommands.includes(sub)) {
        errors.push(`subcommand not allowed for ${params.command}: ${sub}`);
      }
    }
    if (spec.forbidden_args) {
      for (const a of args) {
        if (spec.forbidden_args.includes(a)) errors.push(`forbidden argument: ${a}`);
      }
    }
    return { valid: errors.length === 0, errors };
  }

  async execute(params: ShellCommandParams, ctx: ExecutionContext) {
    const { valid, errors } = this.validate(params);
    if (!valid) throw new ShellEffectorError(errors.join("; "));

    const workingDir = params.working_dir
      ? resolveSafePath(params.working_dir, ctx.repo_root)
      : ctx.repo_root;

    try {
      const result = await execa(params.command, params.args ?? [], {
        cwd: workingDir,
        timeout: params.timeout_ms ?? 30000,
        env: { ...process.env, ...params.env },
        reject: false,
      });
      if (result.exitCode !== 0) {
        throw new ShellEffectorError(`Command exited with code ${result.exitCode}`);
      }
      return { exit_code: result.exitCode ?? -1, output: result.stdout + result.stderr };
    } catch (err) {
      if (err instanceof ShellEffectorError) throw err;
      throw new ShellEffectorError(`Shell command failed: ${(err as Error).message}`);
    }
  }

  // Side effect dari shell command tidak dapat di-undo otomatis
  async rollback(_params: ShellCommandParams, ctx: ExecutionContext): Promise<void> {
    ctx.logger.warn(
      { event: "rollback.not_possible", action_type: this.type },
      "Side effect dari shell command tidak dapat di-undo otomatis.",
    );
  }
}
