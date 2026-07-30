// engine/action_layer/executionEngine.ts
// action_layer.md §4.2 Execution Engine sequence + §4.4 Rollback Strategy

import { randomUUID } from "node:crypto";
import { DryRunGuard } from "./dryRunGuard.js";
import { runUniversalSafetyChecks } from "./safetyChecker.js";
import { PlanPreflightError, SafetyCheckError } from "./types.js";
import type {
  ActionLayerInput, ActionLayerReport, ActionResult, Effector, ExecutionContext,
} from "./types.js";
import type { PlannedAction } from "../action_contracts/index.js";
import type { Logger } from "../shared/logger/index.js";

const KNOWN_NO_ROLLBACK_TYPES = new Set(["git_push", "db_query", "ci_trigger", "shell_command"]);

export class ExecutionEngine {
  constructor(
    private readonly effectors: Map<string, Effector>,
    private readonly logger: Logger,
  ) {}

  async run(input: ActionLayerInput): Promise<ActionLayerReport> {
    const { plan, config } = input;
    const start = Date.now();
    const reportId = randomUUID();

    this.logger.info(
      { event: "action_layer.start", total_actions: plan.actions.length, dry_run: config.dry_run, abort_on_first_failure: config.abort_on_first_failure ?? true },
      "Action Layer started",
    );

    // ── [2] Plan Pre-flight Checks ──
    if (plan.blocked) {
      this.logger.warn({ event: "plan.preflight.blocked", blocked_reason: plan.blocked_reason }, "Plan is blocked");
      throw new PlanPreflightError(`Plan blocked: ${plan.blocked_reason}`);
    }
    if (plan.actions.length === 0) {
      return this.emptyReport(reportId, plan, config, start);
    }
    const ids = plan.actions.map((a) => a.action_id);
    if (new Set(ids).size !== ids.length) {
      throw new PlanPreflightError("Duplicate action_id found in plan");
    }

    // ── [3] Topological Sort ──
    const ordered = this.topologicalSort(plan.actions);

    // ── [4] Per-Action Execution Loop ──
    const backups = new Map<string, string | null>();
    const results: ActionResult[] = [];
    const resultsById = new Map<string, ActionResult>();
    const abortOnFirstFailure = config.abort_on_first_failure ?? true;
    const rollbackOnFailure = config.rollback_on_failure ?? true;

    let failed = false;

    for (const action of ordered) {
      if (failed && abortOnFirstFailure) {
        const skipped = this.skippedResult(action);
        results.push(skipped);
        resultsById.set(action.action_id, skipped);
        continue;
      }

      const result = await this.executeAction(action, config, backups, resultsById);
      results.push(result);
      resultsById.set(action.action_id, result);

      if (result.status === "failure") failed = true;
    }

    // ── Rollback if needed ──
    const rollbackFailures: string[] = [];
    const manualInterventionDetails: string[] = [];

    if (failed && rollbackOnFailure) {
      const executed = results.filter((r) => r.status === "success").reverse();
      for (const result of executed) {
        const action = plan.actions.find((a) => a.action_id === result.action_id)!;
        const effector = this.effectors.get(action.type);
        if (!effector) continue;

        if (KNOWN_NO_ROLLBACK_TYPES.has(action.type)) {
          result.rollback_status = "not_possible";
          manualInterventionDetails.push(`${action.action_id} (${action.type}): no automatic rollback available`);
          continue;
        }

        try {
          const ctx = this.buildContext(action, config, backups, plan);
          await effector.rollback(action.parameters, ctx);
          result.rollback_status = "success";
          this.logger.info({ event: "rollback.action.success", action_id: action.action_id, action_type: action.type }, "Rollback succeeded");
        } catch (err) {
          result.rollback_status = "failed";
          result.rollback_error = (err as Error).message;
          rollbackFailures.push(action.action_id);
          this.logger.error({ event: "rollback.action.failure", action_id: action.action_id, action_type: action.type, error_message: (err as Error).message }, "Rollback failed");
        }
      }
    }

    const manualInterventionRequired = manualInterventionDetails.length > 0 || rollbackFailures.length > 0;
    if (manualInterventionRequired) {
      this.logger.warn({ event: "manual_intervention_required", details: manualInterventionDetails }, "Manual intervention required");
    }

    const status = this.deriveStatus(results, failed, rollbackOnFailure, rollbackFailures);
    const totalDuration = Date.now() - start;

    this.logger.info(
      { event: "action_layer.complete", status, executed: results.filter((r) => r.status !== "skipped").length, successful: results.filter((r) => r.status === "success" || r.status === "dry_run").length, failed: results.filter((r) => r.status === "failure").length, duration_ms: totalDuration },
      "Action Layer complete",
    );

    return {
      report_id: reportId,
      plan_id: plan.plan_id,
      scan_id: plan.scan_id,
      generated_at: new Date().toISOString(),
      dry_run: config.dry_run,
      status,
      total_actions: plan.actions.length,
      executed_actions: results.filter((r) => r.status !== "skipped").length,
      successful_actions: results.filter((r) => r.status === "success" || r.status === "dry_run").length,
      failed_actions: results.filter((r) => r.status === "failure").length,
      skipped_actions: results.filter((r) => r.status === "skipped").length,
      total_duration_ms: totalDuration,
      action_results: results,
      rollback_failures: rollbackFailures,
      manual_intervention_required: manualInterventionRequired,
      manual_intervention_details: manualInterventionDetails,
      summary: `${status}: ${results.filter((r) => r.status === "success" || r.status === "dry_run").length}/${plan.actions.length} actions succeeded`,
    };
  }

  private topologicalSort(actions: PlannedAction[]): PlannedAction[] {
    const byId = new Map(actions.map((a) => [a.action_id, a]));
    const visited = new Set<string>();
    const inStack = new Set<string>();
    const sorted: PlannedAction[] = [];

    const visit = (id: string) => {
      if (visited.has(id)) return;
      if (inStack.has(id)) throw new PlanPreflightError(`Circular depends_on involving ${id}`);
      inStack.add(id);
      const action = byId.get(id);
      if (action) {
        for (const dep of action.depends_on) visit(dep);
        visited.add(id);
        sorted.push(action);
      }
      inStack.delete(id);
    };

    for (const a of [...actions].sort((x, y) => x.order - y.order)) {
      visit(a.action_id);
    }
    return sorted;
  }

  private async executeAction(
    action: PlannedAction,
    config: ActionLayerInput["config"],
    backups: Map<string, string | null>,
    resultsById: Map<string, ActionResult>,
  ): Promise<ActionResult> {
    const startedAt = new Date().toISOString();
    const startMs = Date.now();
    const ctx = this.buildContext(action, config, backups, { plan_id: "" } as never);

    this.logger.info({ event: "action.start", action_type: action.type, target: action.target, order: action.order, risk_level: action.risk_level }, "Action starting");

    const safety = runUniversalSafetyChecks(action, config.repo_root, resultsById);
    if (!safety.safe) {
      for (const f of safety.failures) {
        this.logger.warn({ event: "safety_check.failure", check: f.check, reason: f.reason, fatal: f.fatal }, "Safety check failed");
      }
      return {
        action_id: action.action_id,
        action_type: action.type,
        status: "failure",
        started_at: startedAt,
        completed_at: new Date().toISOString(),
        duration_ms: Date.now() - startMs,
        dry_run: config.dry_run,
        output: null,
        error: { class: "SafetyCheckError", message: "Safety checks failed", safety_check_failures: safety.failures },
        rollback_status: "not_attempted",
        rollback_error: null,
      };
    }

    const effector = this.effectors.get(action.type);
    if (!effector) {
      return {
        action_id: action.action_id, action_type: action.type, status: "failure",
        started_at: startedAt, completed_at: new Date().toISOString(), duration_ms: Date.now() - startMs,
        dry_run: config.dry_run, output: null,
        error: { class: "ActionLayerConfigError", message: `No effector registered for type: ${action.type}` },
        rollback_status: "not_attempted", rollback_error: null,
      };
    }

    const guard = new DryRunGuard(config.dry_run, this.logger);
    const fullCtx: ExecutionContext = { ...ctx, guard } as ExecutionContext & { guard: DryRunGuard };

    try {
      const validation = effector.validate(action.parameters);
      if (!validation.valid) {
        throw new SafetyCheckError(validation.errors.join("; "), []);
      }

      const output = await guard.execute(
        `${action.type}: ${action.target}`,
        () => effector.execute(action.parameters, fullCtx),
        { dry_run: true } as unknown,
      );

      this.logger.info({ event: config.dry_run ? "action.dry_run" : "action.success", action_type: action.type, target: action.target, duration_ms: Date.now() - startMs }, "Action finished");

      return {
        action_id: action.action_id, action_type: action.type,
        status: config.dry_run ? "dry_run" : "success",
        started_at: startedAt, completed_at: new Date().toISOString(), duration_ms: Date.now() - startMs,
        dry_run: config.dry_run, output, error: null,
        rollback_status: "not_attempted", rollback_error: null,
      };
    } catch (err) {
      this.logger.error({ event: "action.failure", action_type: action.type, target: action.target, error_class: (err as Error).name, error_message: (err as Error).message }, "Action failed");
      return {
        action_id: action.action_id, action_type: action.type, status: "failure",
        started_at: startedAt, completed_at: new Date().toISOString(), duration_ms: Date.now() - startMs,
        dry_run: config.dry_run, output: null,
        error: { class: (err as Error).name, message: (err as Error).message },
        rollback_status: "not_attempted", rollback_error: null,
      };
    }
  }

  private buildContext(
    action: PlannedAction,
    config: ActionLayerInput["config"],
    backups: Map<string, string | null>,
    plan: { plan_id: string; scan_id?: string },
  ): ExecutionContext {
    return {
      dry_run: config.dry_run,
      scan_id: plan.scan_id ?? "unknown",
      plan_id: plan.plan_id,
      action_id: action.action_id,
      repo_root: config.repo_root,
      logger: this.logger,
      getBackup: (p: string) => backups.get(p) ?? null,
      setBackup: (p: string, content: string | null) => backups.set(p, content),
    };
  }

  private skippedResult(action: PlannedAction): ActionResult {
    const now = new Date().toISOString();
    return {
      action_id: action.action_id, action_type: action.type, status: "skipped",
      started_at: now, completed_at: now, duration_ms: 0, dry_run: false,
      output: null, error: null, rollback_status: "not_attempted", rollback_error: null,
    };
  }

  private emptyReport(reportId: string, plan: ActionLayerInput["plan"], config: ActionLayerInput["config"], start: number): ActionLayerReport {
    return {
      report_id: reportId, plan_id: plan.plan_id, scan_id: plan.scan_id,
      generated_at: new Date().toISOString(), dry_run: config.dry_run, status: "success",
      total_actions: 0, executed_actions: 0, successful_actions: 0, failed_actions: 0, skipped_actions: 0,
      total_duration_ms: Date.now() - start, action_results: [], rollback_failures: [],
      manual_intervention_required: false, manual_intervention_details: [], summary: "No actions in plan",
    };
  }

  private deriveStatus(
    results: ActionResult[], failed: boolean, rollbackAttempted: boolean, rollbackFailures: string[],
  ): ActionLayerReport["status"] {
    if (!failed) return "success";
    if (!rollbackAttempted) {
      return results.some((r) => r.status === "success") ? "partial_success" : "failure";
    }
    if (rollbackFailures.length > 0) {
      return results.some((r) => r.rollback_status === "success") ? "partial_rollback" : "rollback_failed";
    }
    return "rolled_back";
  }
}
