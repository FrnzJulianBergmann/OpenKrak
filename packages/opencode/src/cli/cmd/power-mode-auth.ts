// CLI command: openkrak power-mode <license-key>
// Redeems a Payhip license key ON TOP OF the existing free-tier account
// (device id) that Power Mode auto-creates on first use. If this is the
// very first thing the user runs, an account is created here too.
import { Effect } from "effect"
import { effectCmd, fail } from "../effect-cmd"
import { UI } from "../ui"
import { Auth } from "@/auth"
import { randomUUID } from "node:crypto"

const LICENSE_URL = process.env["OPENKRAK_LICENSE_URL"] ?? "https://openkrak-license-server.openkrak.workers.dev"

async function getOrCreateAccountKey(): Promise<string> {
  const existing = await Auth.Service.use((auth) => auth.get("openkrak-power-mode"))
  if (existing && existing.type === "api") return existing.key

  const deviceKey = `device_${randomUUID()}`
  await Auth.Service.use((auth) => auth.set("openkrak-power-mode", { type: "api", key: deviceKey }))
  return deviceKey
}

async function redeem(accountKey: string, licenseKey: string) {
  const res = await fetch(`${LICENSE_URL}/v1/redeem`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ account_key: accountKey, license_key: licenseKey }),
  })
  const data = (await res.json()) as {
    ok?: boolean
    error?: string
    message?: string
    credited_micros?: number
    balance_micros?: number
    already_redeemed?: boolean
  }
  return { status: res.status, data }
}

export const PowerModeAuthCommand = effectCmd({
  command: "power-mode <license-key>",
  describe: "top up Power Mode credits by redeeming a purchased license key (everyone also gets 5 KP free daily, no key needed)",
  builder: (yargs) =>
    yargs.positional("license-key", {
      describe: "license key from your Payhip purchase confirmation",
      type: "string",
      demandOption: true,
    }),
  handler: Effect.fn("Cli.powerModeAuth")(function* (args) {
    const licenseKey = args["license-key"] as string
    const accountKey = yield* Effect.promise(() => getOrCreateAccountKey())
    const { status, data } = yield* Effect.promise(() => redeem(accountKey, licenseKey))

    if (status !== 200 || !data.ok) {
      return yield* fail(data.message ?? data.error ?? "Could not redeem this license key.")
    }

    if (data.already_redeemed) {
      UI.println(
        UI.Style.TEXT_WARNING_BOLD +
          "This key was already redeemed before. " +
          UI.Style.TEXT_NORMAL +
          `Your current balance is $${((data.balance_micros ?? 0) / 1_000_000).toFixed(5)}.`,
      )
      return
    }

    UI.println(
      UI.Style.TEXT_SUCCESS_BOLD +
        "Power Mode topped up! " +
        UI.Style.TEXT_NORMAL +
        `Credited $${((data.credited_micros ?? 0) / 1_000_000).toFixed(2)}. ` +
        `Balance: $${((data.balance_micros ?? 0) / 1_000_000).toFixed(5)}.`,
    )
  }),
})
