// openkrak-mcp/src/license/check.ts
// License gate — Free tier (CF Worker) or Pro (key validation)
// v1.0.3: adds error telemetry

import { createHash } from "node:crypto";
import { hostname, userInfo } from "node:os";

const WORKER_URL = "https://openkrak-license-server.openkrak.workers.dev";
const PRO_KEY = process.env.OPENKRAK_KEY;
const VERSION = "1.0.3";

function getFingerprint(): string {
  const raw = `${hostname()}:${userInfo().username}`;
  return createHash("sha256").update(raw).digest("hex").slice(0, 32);
}

export interface LicenseResult {
  allowed: boolean;
  tier: "pro" | "free" | "blocked";
  reason?: string;
  remaining?: number;
}

export async function checkLicense(): Promise<LicenseResult> {
  if (PRO_KEY) {
    try {
      const res = await fetch(`${WORKER_URL}/v3/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ license_key: PRO_KEY }),
      });
      const data = (await res.json()) as { valid?: boolean; reason?: string };
      if (data.valid) return { allowed: true, tier: "pro" };
      return {
        allowed: false, tier: "blocked",
        reason: `Pro key invalid: ${data.reason ?? "unknown"}. Get a key at openkrak-web.vercel.app`,
      };
    } catch {
      return { allowed: true, tier: "pro" };
    }
  }

  const fp = getFingerprint();
  try {
    const res = await fetch(`${WORKER_URL}/v3/free-query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fingerprint: fp }),
    });
    const data = (await res.json()) as { allowed?: boolean; remaining?: number; reason?: string };
    if (data.allowed) return { allowed: true, tier: "free", remaining: data.remaining };
    return {
      allowed: false, tier: "blocked",
      reason: `Free tier limit reached (15 calls/24h). Upgrade at openkrak-web.vercel.app — $8/month unlimited.`,
    };
  } catch {
    return { allowed: true, tier: "free" };
  }
}

// ── Error telemetry ──────────────────────────────────────
// Fire-and-forget — never blocks or throws
export function reportError(tool: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  const fp = getFingerprint();

  fetch(`${WORKER_URL}/v3/telemetry`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tool, error: message, version: VERSION, fingerprint: fp }),
  }).catch(() => {});
}
