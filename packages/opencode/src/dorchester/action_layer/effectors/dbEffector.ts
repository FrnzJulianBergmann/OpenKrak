// engine/action_layer/effectors/dbEffector.ts
// action_layer.md §3.3 — kysely (ADR-010)

import { Kysely, sql } from "kysely";
import { DbEffectorError } from "../types.js";
import type { Effector, ExecutionContext, ValidationResult } from "../types.js";
import type { DbQueryParams } from "../../action_contracts/index.js";

const DESTRUCTIVE_RE = /\b(DROP\s+TABLE|TRUNCATE|DROP\s+DATABASE)\b/i;
const RAW_INTERPOLATION_RE = /\$\{|`.*\$\{.*\}.*`/;

export interface DbEffectorDeps {
  // Caller (orchestrator runtime) provides a connected Kysely instance per database identifier.
  getConnection: (database?: string) => Kysely<unknown>;
}

export class DbQueryEffector implements Effector<DbQueryParams, { rows_affected: number }> {
  readonly type = "db_query" as const;

  constructor(private readonly deps: DbEffectorDeps) {}

  validate(params: DbQueryParams): ValidationResult {
    const errors: string[] = [];
    if (!params.query) errors.push("query is required");
    if (RAW_INTERPOLATION_RE.test(params.query ?? "") && !params.params) {
      errors.push("query appears to use raw string interpolation without parameterization");
    }
    if (DESTRUCTIVE_RE.test(params.query ?? "") && !params.confirmed) {
      errors.push("destructive query (DROP/TRUNCATE) requires confirmed: true");
    }
    return { valid: errors.length === 0, errors };
  }

  async execute(params: DbQueryParams, ctx: ExecutionContext) {
    const db = this.deps.getConnection(params.database);
    const useTransaction = params.transaction ?? true;

    const run = async (executor: Kysely<unknown>) => {
      const result = await sql.raw(params.query).execute(executor);
      const rowsAffected = Array.isArray(result.rows) ? result.rows.length : 0;

      if (params.expect_rows !== undefined && rowsAffected !== params.expect_rows) {
        throw new DbEffectorError(
          `Expected ${params.expect_rows} rows affected, got ${rowsAffected}`,
        );
      }
      return { rows_affected: rowsAffected };
    };

    if (useTransaction) {
      return db.transaction().execute((trx) => run(trx as unknown as Kysely<unknown>));
    }
    return run(db);
  }

  // Sudah commit tidak dapat di-rollback otomatis (transaction auto-rollback hanya
  // jika belum commit — itu ditangani oleh kysely .transaction() sendiri).
  async rollback(_params: DbQueryParams, ctx: ExecutionContext): Promise<void> {
    ctx.logger.warn(
      { event: "rollback.not_possible", action_type: this.type },
      "DbEffector rollback: query yang sudah commit tidak dapat di-undo otomatis. Manual intervention diperlukan.",
    );
  }
}
