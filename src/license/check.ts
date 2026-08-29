// openkrak-mcp/src/license/check.ts
// License gate — Free tier (CF Worker) or Pro (key validation)

const WORKER_URL = "https://openkrak-license-server.openkrak.workers.dev";
const PRO_KEY = process.env.OPENKRAK_KEY;

// Machine fingerprint: hostname + username (matches CF KV key pattern)
import { createHash } from "node:crypto";
import { hostname, userInfo } from "node:os";

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
  // Pro key path
  if (PRO_KEY) {
    try {
      const res = await fetch(`${WORKER_URL}/v3/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: PRO_KEY }),
      });
      const data = (await res.json()) as { valid?: boolean; reason?: string };
      if (data.valid) {
        return { allowed: true, tier: "pro" };
      }
      return {
        allowed: false,
        tier: "blocked",
        reason: `Pro key invalid: ${data.reason ?? "unknown"}. Get a key at openkrak.dev`,
      };
    } catch {
      // Network error — fail open for pro (offline grace)
      return { allowed: true, tier: "pro" };
    }
  }

  // Free tier path
  const fp = getFingerprint();
  try {
    const res = await fetch(`${WORKER_URL}/v3/free-query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fingerprint: fp }),
    });
    const data = (await res.json()) as {
      allowed?: boolean;
      remaining?: number;
      reason?: string;
    };
    if (data.allowed) {
      return { allowed: true, tier: "free", remaining: data.remaining };
    }
    return {
      allowed: false,
      tier: "blocked",
      reason: `Free tier limit reached (15 calls/24h). Upgrade at openkrak.dev — $8/month for unlimited.`,
    };
  } catch {
    // CF Worker unreachable — fail open (don't block users on network issues)
    return { allowed: true, tier: "free" };
  }
}
