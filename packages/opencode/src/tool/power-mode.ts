// Power Mode — Dorchester engine, bundled and running LOCALLY inside
// OpenKrak. Everyone gets 5 KP free per day automatically (no purchase or
// signup required) via an auto-generated local device id. Buying a Payhip
// bundle (see power-mode-auth.ts) adds credit on top of the same account.
import { Effect, Schema } from "effect"
import { InstanceState } from "@/effect/instance-state"
import { Auth } from "@/auth"
import * as Tool from "./tool"
import DESCRIPTION from "./power-mode.txt"
import { randomUUID } from "node:crypto"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { existsSync, readFileSync, unlinkSync, mkdirSync } from "node:fs"
import { tmpdir, homedir } from "node:os"

export const Parameters = Schema.Struct({
  objective: Schema.String.annotate({
    description: "What you're trying to accomplish, in plain language",
  }),
  target: Schema.optional(Schema.String).annotate({
    description: "Subfolder or file to scope the analysis to, relative to the repo root. Default: packages/opencode. Use a smaller scope for faster results.",
  }),
})

const CREDIT_SERVER_URL = process.env["OPENKRAK_LICENSE_URL"] ?? "https://openkrak-license-server.openkrak.workers.dev"

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

// Run Dorchester engine as child process — avoids module boundary issues
// with --conditions=browser context used by the TUI
function runEngineChildProcess(repoPath: string, objective: string): any | null {
  try {
    const outDir = path.join(homedir(), ".opencode")
    mkdirSync(outDir, { recursive: true })
    const outFile = path.join(tmpdir(), `openkrak_${Date.now()}.json`)
    // Resolve cli.ts relative to the opencode package root (where bun is run from)
    const cliPath = path.join(process.cwd(), "src", "dorchester", "interface", "cli.ts")
    const r = spawnSync(process.execPath, ["run", cliPath, repoPath, objective], {
      timeout: 120_000,
      encoding: "utf8",
      env: { ...process.env, DORCHESTER_OUT: outFile, DORCHESTER_LOG_STDERR: "0" },
    })
    if (r.status !== 0) return null
    if (!existsSync(outFile)) return null
    const data = JSON.parse(readFileSync(outFile, "utf8"))
    try { unlinkSync(outFile) } catch {}
    return data
  } catch {
    return null
  }
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

          const repoPath = params.target
            ? path.join(ins.worktree, params.target)
            : path.join(ins.worktree, "packages/opencode")

          // Engine runs as child process — no module import issues
          const mahadata = yield* Effect.promise(() =>
            Promise.resolve(runEngineChildProcess(repoPath, params.objective)),
          )

          if (!mahadata) {
            return {
              title: "Power Mode analysis failed",
              metadata: {},
              output: "Engine error: child process failed or timed out.",
            }
          }

          const repo = mahadata?.repository as { total_loc?: number } | undefined
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

          const brief = mahadata?.execution_brief ?? mahadata

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

