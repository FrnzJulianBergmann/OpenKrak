// engine/shared/logger/index.ts
// ADR-013 — Pino-based Structured Logging
//
// Output: file-only (~/.opencode/dorchester.log) when running inside a TTY
// (e.g. the OpenKrak TUI) to avoid polluting the terminal UI.
// Falls back to process.stderr when LOG_LEVEL=debug or NO_TTY=1 is set,
// which is useful for raw CLI debugging outside the TUI.

import pino, { type Logger as PinoLogger } from "pino";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type Logger = PinoLogger;

export interface LogContext extends Record<string, unknown> {
  event?: string;
  scan_id?: string;
  component?: string;
  [key: string]: unknown;
}

/**
 * Resolve log destination:
 * - DEBUG mode → stderr (developer wants to see raw logs)
 * - Normal / TUI mode → file at ~/.opencode/dorchester.log
 *   (keeps the TUI screen clean)
 */
function resolveDestination(): NodeJS.WritableStream {
  const debugMode =
    process.env["LOG_LEVEL"] === "debug" ||
    process.env["DORCHESTER_LOG_STDERR"] === "1";

  if (debugMode) return process.stderr;

  try {
    const dir = path.join(os.homedir(), ".opencode");
    fs.mkdirSync(dir, { recursive: true });
    const logPath = path.join(dir, "dorchester.log");
    // append mode — survives multiple sessions
    return fs.createWriteStream(logPath, { flags: "a" });
  } catch {
    // If we can't write to disk for any reason, fall back to stderr silently
    return process.stderr;
  }
}

// Singleton destination — resolved once at module load
const _dest = resolveDestination();

export function createLogger(component: string): Logger {
  return pino(
    {
      level: process.env["LOG_LEVEL"] ?? "info",
      base: { component },
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: {
        level: (label) => ({ level: label }),
      },
    },
    _dest,
  );
}

export function createChildLogger(parent: Logger, bindings: LogContext): Logger {
  return parent.child(bindings);
}

export function createScanLogger(parent: Logger, scanId: string): Logger {
  return parent.child({ scan_id: scanId });
}

export function withContext(logger: Logger, context: LogContext): Logger {
  return logger.child(context);
}
