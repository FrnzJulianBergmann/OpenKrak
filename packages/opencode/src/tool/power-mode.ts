// Power Mode — Dorchester engine bridge, built into OpenKrak core.
// Unlike a plugin tool, this ships with the client by default and cannot
// be disabled by omission — it's always available once an OPENKRAK_API_KEY
// is configured. The engine itself never runs here: this only calls the
// hosted Dorchester API and returns the ExecutionBrief to the model.
import { Effect, Schema } from "effect"
import { InstanceState } from "@/effect/instance-state"
import * as Tool from "./tool"
import DESCRIPTION from "./power-mode.txt"

export const Parameters = Schema.Struct({
  objective: Schema.String.annotate({
    description: "What you're trying to accomplish, in plain language",
  }),
  target: Schema.optional(Schema.String).annotate({
    description: "File or symbol to focus the query on, if known",
  }),
})

const DORCHESTER_API_URL = process.env["DORCHESTER_API_URL"] ?? "https://api.openkrak.dev/v1/query"

export const PowerModeTool = Tool.define(
  "power_mode",
  Effect.gen(function* () {
    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: { objective: string; target?: string }, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const ins = yield* InstanceState.context
          const apiKey = process.env["OPENKRAK_API_KEY"]

          if (!apiKey) {
            return {
              title: "Power Mode not configured",
              metadata: {},
              output:
                "OPENKRAK_API_KEY is not set. Get one at https://openkrak.dev and set it as an environment variable to enable Power Mode.",
            }
          }

          yield* ctx.ask({
            permission: "power_mode",
            patterns: [params.objective],
            always: ["*"],
            metadata: { objective: params.objective, target: params.target },
          })

          const response = yield* Effect.promise(() =>
            fetch(DORCHESTER_API_URL, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
              },
              body: JSON.stringify({
                objective: params.objective,
                target: params.target ?? null,
                repo_path: ins.worktree,
              }),
            }),
          )

          if (!response.ok) {
            const errBody = yield* Effect.promise(() => response.text().catch(() => ""))
            if (response.status === 402) {
              return {
                title: "Power Mode — out of credit",
                metadata: { status: 402 },
                output:
                  "Your OpenKrak credit balance is exhausted for now. It tops up $2/day and rolls over — " +
                  `you can also top up manually. (server said: ${errBody})`,
              }
            }
            return {
              title: "Power Mode request failed",
              metadata: { status: response.status },
              output: `Dorchester API error ${response.status}: ${errBody}`,
            }
          }

          const brief = yield* Effect.promise(() => response.json() as Promise<Record<string, unknown>>)

          return {
            title: `Power Mode: ${params.objective}`,
            metadata: { token_budget_estimate: brief?.["token_budget_estimate"] ?? null },
            output: JSON.stringify(brief, null, 2),
          }
        }).pipe(Effect.orDie),
    }
  }),
)
