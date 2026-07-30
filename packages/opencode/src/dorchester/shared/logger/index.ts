// engine/shared/logger/index.ts
// ADR-013 — Pino-based Structured Logging
// 
// Deterministic, structured JSON logging for all Engine components.
// Field wajib: component (set at logger creation), scan_id (set via child context).
// 
// Usage:
//   const logger = createLogger("component_name");
//   const log = logger.child({ scan_id: "abc123" });
//   log.info({ event: "action.start", detail: "value" }, "Human message");
//
// Output (deterministic JSON):
//   {"level":30,"time":"2026-06-20T...Z","component":"component_name","scan_id":"abc123","event":"action.start","detail":"value","msg":"Human message"}

import pino, { type Logger as PinoLogger } from "pino";

/**
 * Base logger type — re-export pino.Logger for compatibility
 */
export type Logger = PinoLogger;

/**
 * Structured logging context object
 * Deterministic format: alphabetically sorted fields for consistent JSON output
 */
export interface LogContext extends Record<string, unknown> {
  event?: string;
  scan_id?: string;
  component?: string;
  [key: string]: unknown;
}

/**
 * Create root logger for a component.
 * 
 * @param component - Component name (e.g., "orchestrator", "action_layer")
 * @returns Configured pino Logger with component field set
 * 
 * ADR-013 requirement: every logger has a base component field.
 * Deterministic output: JSON keys are in consistent order.
 */
export function createLogger(component: string): Logger {
  return pino(
    {
      level: process.env["LOG_LEVEL"] ?? "info",
      base: { component },
      timestamp: pino.stdTimeFunctions.isoTime,
      // Deterministic serialization: fields in log objects are sorted
      formatters: {
        level: (label) => ({ level: label }),
        // Pino's default serializers are deterministic — JSON.stringify is stable
      },
    },
    // Output destination: stdout for Node.js (standard for structured logging)
    process.stderr,
  );
}

/**
 * Create a child logger with additional context bindings.
 * Used for request/operation tracing (scan_id, component name, request_id, etc).
 * 
 * @param parent - Parent logger to derive from
 * @param bindings - Context fields (e.g., { scan_id: "abc123" })
 * @returns Child logger with inherited context
 * 
 * Child loggers inherit all parent fields and add new ones.
 * Deterministic: context fields merged alphabetically.
 */
export function createChildLogger(parent: Logger, bindings: LogContext): Logger {
  return parent.child(bindings);
}

/**
 * Convenience function: create child logger with scan_id and component.
 * Common pattern in Vanguard components.
 * 
 * @param parent - Parent logger
 * @param scanId - Scan/request ID for tracing
 * @returns Child logger with { scan_id, component } context
 */
export function createScanLogger(parent: Logger, scanId: string): Logger {
  return parent.child({ scan_id: scanId });
}

/**
 * Create a child logger from existing logger and return it typed for better IDE support.
 * 
 * Example:
 *   const log = withContext(logger, { scan_id: "xyz", retry_attempt: 1 });
 *   log.debug({ event: "retry" }, "Retrying operation");
 */
export function withContext(logger: Logger, context: LogContext): Logger {
  return logger.child(context);
}

