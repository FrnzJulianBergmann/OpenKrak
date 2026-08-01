// CLI command: openkrak power-mode <license-key>
// Redeems a Payhip license key against the OpenKrak credit server, then
// stores it via the standard Auth service (same mechanism used for
// provider API keys — 0600 permissions, ~/.local/share/opencode/auth.json)
// so power-mode.ts can read it without an env var.
import { Effect } from "effect"
import { effectCmd, fail } from "../effect-cmd"
import { UI } from "../ui"
import { Auth } from "@/auth"

const LICENSE_URL = process.env["OPENKRAK_LICENSE_URL"] ?? "https://openkrak-license-server.openkrak.workers.dev"

async function redeem(licenseKey: string) {
  const res = await fetch(`${LICENSE_URL}/v1/redeem`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ license_key: licenseKey }),
  })
  const data = (await res.json()) as {
    ok?: boolean
    error?: string
    message?: string
    credited_cents?: number
    balance_cents?: number
    already_redeemed?: boolean
  }
  return { status: res.status, data }
}

export const PowerModeAuthCommand = effectCmd({
  command: "power-mode <license-key>",
  describe: "activate Power Mode credits by redeeming a purchased license key",
  builder: (yargs) =>
    yargs.positional("license-key", {
      describe: "license key from your Payhip purchase confirmation",
      type: "string",
      demandOption: true,
    }),
  handler: Effect.fn("Cli.powerModeAuth")(function* (args) {
    const licenseKey = args["license-key"] as string
    const { status, data } = yield* Effect.promise(() => redeem(licenseKey))

    if (status !== 200 || !data.ok) {
      return yield* fail(data.message ?? data.error ?? "Could not redeem this license key.")
    }

    yield* Auth.Service.use((auth) => auth.set("openkrak-power-mode", { type: "api", key: licenseKey }))

    if (data.already_redeemed) {
      UI.println(
        UI.Style.TEXT_WARNING_BOLD +
          "This key was already redeemed before. " +
          UI.Style.TEXT_NORMAL +
          `Your current balance is $${((data.balance_cents ?? 0) / 100).toFixed(2)}.`,
      )
      return
    }

    UI.println(
      UI.Style.TEXT_SUCCESS_BOLD +
        "Power Mode activated! " +
        UI.Style.TEXT_NORMAL +
        `Credited $${((data.credited_cents ?? 0) / 100).toFixed(2)}. ` +
        `Balance: $${((data.balance_cents ?? 0) / 100).toFixed(2)}.`,
    )
  }),
})
