// engine/action_layer/effectors/ciEffector.ts
// action_layer.md §3.5 — undici (Node.js built-in fetch)

import { CiEffectorError } from "../types.js";
import type { Effector, ExecutionContext, ValidationResult } from "../types.js";
import type { CiTriggerParams } from "../../action_contracts/index.js";

export class CiTriggerEffector implements Effector<CiTriggerParams, { status: number }> {
  readonly type = "ci_trigger" as const;

  validate(params: CiTriggerParams): ValidationResult {
    const errors: string[] = [];
    if (!params.endpoint?.startsWith("https://")) errors.push("endpoint must be HTTPS");
    if (!params.auth_env_var || !process.env[params.auth_env_var]) {
      errors.push(`auth_env_var not set in environment: ${params.auth_env_var}`);
    }
    const knownProviders = ["github_actions", "gitlab_ci", "jenkins", "circleci"];
    if (!knownProviders.includes(params.provider)) errors.push("unknown provider");
    return { valid: errors.length === 0, errors };
  }

  async execute(params: CiTriggerParams, ctx: ExecutionContext) {
    const { valid, errors } = this.validate(params);
    if (!valid) throw new CiEffectorError(errors.join("; "));

    const token = process.env[params.auth_env_var]!;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), params.timeout_ms ?? 10000);

    try {
      const response = await fetch(params.endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(params.payload),
        signal: controller.signal,
      });
      return { status: response.status };
    } catch (err) {
      throw new CiEffectorError(`CI trigger failed: ${(err as Error).message}`);
    } finally {
      clearTimeout(timer);
    }
  }

  // Tidak ada rollback deterministik untuk CI trigger
  async rollback(_params: CiTriggerParams, ctx: ExecutionContext): Promise<void> {
    ctx.logger.warn(
      { event: "rollback.not_possible", action_type: this.type },
      "CI pipeline sudah di-trigger, manual cancellation diperlukan jika diinginkan.",
    );
  }
}
