// engine/orchestrator/planNormalizer.ts
// Dorchester Orchestrator — PlanNormalizer
// dorchester_orchestrator.md §4.5

import { randomUUID } from "node:crypto";
import { PlanCircularDependencyError } from "./types.js";
import type { OrchestratorPlan, PlannedAction } from "./types.js";

export class PlanNormalizer {
  normalize(raw: OrchestratorPlan, scanId: string): OrchestratorPlan {
    return {
      ...raw,
      plan_id: raw.plan_id || randomUUID(),
      generated_at: new Date().toISOString(),
      scan_id: scanId,
      actions: this.normalizeActions(raw.actions),
    };
  }

  private normalizeActions(actions: PlannedAction[]): PlannedAction[] {
    const withIds = actions.map((a) => ({
      ...a,
      action_id: a.action_id || randomUUID(),
    }));

    const sorted = [...withIds].sort((a, b) => a.order - b.order);

    const ids = new Set(sorted.map((a) => a.action_id));
    for (const a of sorted) {
      for (const dep of a.depends_on) {
        if (!ids.has(dep)) {
          throw new PlanCircularDependencyError(
            `Action ${a.action_id} depends_on unknown action_id: ${dep}`,
          );
        }
      }
    }

    this.detectCycle(sorted);
    return sorted;
  }

  private detectCycle(actions: PlannedAction[]): void {
    const visited = new Set<string>();
    const inStack = new Set<string>();
    const byId = new Map(actions.map((a) => [a.action_id, a]));

    const dfs = (id: string): void => {
      visited.add(id);
      inStack.add(id);
      const action = byId.get(id);
      for (const dep of action?.depends_on ?? []) {
        if (!visited.has(dep)) {
          dfs(dep);
        } else if (inStack.has(dep)) {
          throw new PlanCircularDependencyError(
            `Circular dependency detected involving action ${id} -> ${dep}`,
          );
        }
      }
      inStack.delete(id);
    };

    for (const a of actions) {
      if (!visited.has(a.action_id)) dfs(a.action_id);
    }
  }
}
