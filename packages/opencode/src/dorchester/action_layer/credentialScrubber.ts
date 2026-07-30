// engine/action_layer/credentialScrubber.ts
// Action Layer — CredentialScrubber
// action_layer.md §7 Logging Contract — C-09: credential tidak pernah muncul di log.

const SENSITIVE_KEY_RE = /(password|token|secret|key|auth|credential|api_key)/i;

export function scrubCredentials<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;

  if (Array.isArray(value)) {
    return value.map((v) => scrubCredentials(v)) as unknown as T;
  }

  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEY_RE.test(key)) {
      result[key] = "[REDACTED]";
    } else if (val !== null && typeof val === "object") {
      result[key] = scrubCredentials(val);
    } else {
      result[key] = val;
    }
  }
  return result as T;
}
