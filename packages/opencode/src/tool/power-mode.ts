// Power Mode — Dorchester engine, bundled and running LOCALLY inside
// OpenKrak. The engine does the analysis on-device (filesystem, git, AST
// parsing never leave this machine). The only network calls are to the
// OpenKrak credit server: (1) check balance is non-zero before running,
// (2) deduct cost after running, based on lines actually analyzed.
import { Effect, Schema } from "effect"
import { InstanceState } from "@/effect/instance-state"
import { Auth } from "@/auth"
import * as Tool from "./tool"
import { runPipeline } from "../dorchester/interface/pipeline"
import DESCRIPTION from "./power-mode.txt"

export const Parameters = Schema.Struct({
  objective: Schema.String.annotate({
    description: "What you're trying to accomplish, in plain language",
  }),
  target: Schema.optional(Schema.String).annotate({
    description: "File or symbol to focus the query on, if known",
  }),
})

const CREDIT_SERVER_URL = process.env["OPENKRAK_LICENSE_URL"] ?? "https://openkrak-license-server.openkrak.workers.dev"

async function getBalanceCents(licenseKey: string): Promise<number> {
  const res = await fetch(`${CREDIT_SERVER_URL}/v1/balance?license_key=${encodeURIComponent(licenseKey)}`)
  const data = (await res.json()) as { balance_cents?: number }
  return data.balance_cents ?? 0
}

async function deduct(licenseKey: string, locProcessed: number, objective: string, target?: string) {
  const res = await fetch(`${CREDIT_SERVER_URL}/v1/deduct`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ license_key: licenseKey, loc_processed: locProcessed, objective, target }),
  })
  const data = (await res.json()) as { ok?: boolean; message?: string; balance_cents?: number }
  return { status: res.status, data }
}

export const PowerModeTool = Tool.define(
  "power_mode",
  Effect.gen(function* () {
    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: { objective: string; target?: string }, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const ins = yield* InstanceState.context

          const authInfo = yield* Auth.Service.use((auth) => auth.get("openkrak-power-mode"))
          if (!authInfo || authInfo.type !== "api") {
            return {
              title: "Power Mode not activated",
              metadata: {},
              output:
                "No license key found. Buy credits then run `openkrak power-mode <your-key>` to activate. " +
                "See https://openkrak.dev for where to buy.",
            }
          }
          const licenseKey = authInfo.key

          const balanceCents = yield* Effect.promise(() => getBalanceCents(licenseKey))
          if (balanceCents <= 0) {
            return {
              title: "Power Mode — out of credit",
              metadata: {},
              output: "Your OpenKrak credit balance is $0.00. Buy more credits to keep using Power Mode.",
            }
          }

          yield* ctx.ask({
            permission: "power_mode",
            patterns: [params.objective],
            always: ["*"],
            metadata: { objective: params.objective, target: params.target },
          })

          // Runs entirely locally — no repo content leaves this machine.
          const result = yield* Effect.promise(() =>
            runPipeline({ repoPath: ins.worktree, objective: params.objective }),
          )

          if (result.status === "failed") {
            return {
              title: "Power Mode analysis failed",
              metadata: {},
              output: `Engine error: ${result.error}`,
            }
          }

          const repo = (result.mahadata as any)?.repository as { total_loc?: number } | undefined
          const locProcessed = repo?.total_loc ?? 0

          const { status, data } = yield* Effect.promise(() =>
            deduct(licenseKey, locProcessed, params.objective, params.target),
          )

          if (status === 402) {
            return {
              title: "Power Mode — out of credit",
              metadata: {},
              output: data.message ?? "Insufficient balance for this analysis.",
            }
          }

          const brief = (result.mahadata as any)?.execution_brief ?? result.mahadata

          return {
            title: `Power Mode: ${params.objective}`,
            metadata: {
              token_budget_estimate: brief?.token_budget_estimate ?? null,
              balance_cents_remaining: data.balance_cents ?? null,
            },
            output: JSON.stringify(brief, null, 2),
          }
        }).pipe(Effect.orDie),
    }
  }),
)
