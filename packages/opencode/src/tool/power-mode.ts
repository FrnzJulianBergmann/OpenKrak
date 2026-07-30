// Power Mode — Dorchester engine, bundled and running LOCALLY inside
// OpenKrak (this file), not on a remote server. Only a lightweight license
// check hits the network (Cloudflare Worker -> Gumroad License API).
// The actual analysis (filesystem read, git, AST parsing) all happens on
// the user's own machine — no repo content is ever sent anywhere.
import { Effect, Schema } from "effect"
import { InstanceState } from "@/effect/instance-state"
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

const LICENSE_CHECK_URL = process.env["OPENKRAK_LICENSE_URL"] ?? "https://api.openkrak.dev/v1/verify-license"

// Cache the license check for the process lifetime so we don't hit the
// network on every single tool call — just once per session.
let cachedLicenseValid: boolean | null = null

async function checkLicense(licenseKey: string): Promise<{ valid: boolean; message?: string }> {
  if (cachedLicenseValid !== null) return { valid: cachedLicenseValid }
  try {
    const res = await fetch(LICENSE_CHECK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ license_key: licenseKey }),
    })
    const data = (await res.json()) as { valid: boolean; message?: string }
    cachedLicenseValid = data.valid
    return data
  } catch {
    // Network hiccup shouldn't hard-block a paying user mid-session.
    // Fail open for this call, but don't cache a false positive.
    return { valid: true, message: "license server unreachable, proceeding optimistically" }
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
          const licenseKey = process.env["OPENKRAK_LICENSE_KEY"]

          if (!licenseKey) {
            return {
              title: "Power Mode not activated",
              metadata: {},
              output:
                "No license key found. Get one at https://openkrak.gumroad.com and set OPENKRAK_LICENSE_KEY.",
            }
          }

          const license = yield* Effect.promise(() => checkLicense(licenseKey))
          if (!license.valid) {
            return {
              title: "Power Mode — invalid license",
              metadata: {},
              output: license.message ?? "Your OpenKrak license key is not valid or has expired.",
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

          const brief = (result.mahadata as any)?.execution_brief ?? result.mahadata

          return {
            title: `Power Mode: ${params.objective}`,
            metadata: { token_budget_estimate: brief?.token_budget_estimate ?? null },
            output: JSON.stringify(brief, null, 2),
          }
        }).pipe(Effect.orDie),
    }
  }),
)
