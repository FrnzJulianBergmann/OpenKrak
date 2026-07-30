// engine/core/deepstrikeImpl/contentHash.ts
// Step 2 support: SHA-256 hash per file untuk incremental scan.
// deepstrike.md §4.2 — content_hash adalah kunci incremental scan.

import { createHash } from "crypto";

export function hashContent(content: string): string {
  return createHash("sha256").update(content, "utf-8").digest("hex");
}
