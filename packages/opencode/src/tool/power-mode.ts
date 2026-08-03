// Power Mode — Dorchester engine, bundled and running LOCALLY inside
// OpenKrak. Everyone gets 5 KP free per day automatically (no purchase or
// signup required) via an auto-generated local device id. Buying a Payhip
// bundle (see power-mode-auth.ts) adds credit on top of the same account.
import { Effect, Schema } from "effect"
import { InstanceState } from "@/effect/instance-state"
import { Auth } from "@/auth"
import * as Tool from "./tool"
import { runPipeline } from "../dorchester/interface/pipeline"
import DESCRIPTION from "./power-mode.txt"
import { randomUUID } from "node:crypto"

export const Parameters = Schema.Struct({
  objective: Schema.String.annotate({
    description: "What you're trying to accomplish, in plain language",
  }),
  target: Schema.optional(Schema.String).annotate({
    description: "File or symbol to focus the query on, if known",
  }),
})

const CREDIT_SERVER_URL = process.env["OPENKRAK_LICENSE_URL"] ?? "https://openkrak-license-server.openkrak.workers.dev"

/**
 * Every OpenKrak install gets a stable anonymous device id the first time
 * Power Mode is used — this is what the free 5 KP/day is tracked against.
 * No account, no email, no purchase required. Stored via the same Auth
 * service used for provider API keys (0600 perms).
 */
async function getOrCreateAccountKey(): Promise<string> {
  const existing = await Auth.Service.use((auth) => auth.get("openkrak-power-mode"))
  if (existing && existing.type === "api") return existing.key

  const deviceKey = `device_${randomUUID()}`
  await Auth.Service.use((auth) => auth.set("openkrak-power-mode", { type: "api", key: deviceKey }))
  return deviceKey
}

async function getBalanceMicros(accountKey: string): Promise<number> {
  const res = await fetch(`${CREDIT_SERVER_URL}/v1/balance?account_key=${encodeURIComponent(accountKey)}`)
  const data = (await res.json()) as { balance_micros?: number }
  return data.balance_micros ?? 0
}

async function deduct(accountKey: string, locProcessed: number, objective: string, target?: string) {
  const res = await fetch(`${CREDIT_SERVER_URL}/v1/deduct`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ account_key: accountKey, loc_processed: locProcessed, objective, target }),
  })
  const data = (await res.json()) as { ok?: boolean; message?: string; balance_micros?: number }
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
          const accountKey = yield* Effect.promise(() => getOrCreateAccountKey())

          const balanceMicros = yield* Effect.promise(() => getBalanceMicros(accountKey))
          if (balanceMicros <= 0) {
            return {
              title: "Power Mode — out of credit",
              metadata: {},
              output:
                "Your OpenKrak credit balance is $0. Your free 5 KP renews daily — try again tomorrow, " +
                "or buy more credit and run `openkrak power-mode <your-key>` to top up now.",
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
            deduct(accountKey, locProcessed, params.objective, params.target),
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
              balance_micros_remaining: data.balance_micros ?? null,
            },
            output: JSON.stringify(brief, null, 2),
          }
        }).pipe(Effect.orDie),
    }
  }),
)
