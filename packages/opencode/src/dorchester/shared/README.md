# engine/shared/ — Shared Utilities
**Version:** 1.0  
**Authority:** ADR-013 (Structured Logging)  
**Owner:** Claude F18 (Division Golf)  
**Status:** READY FOR USE  
**Date:** 2026-06-20

---

## Overview

`engine/shared/` contains reusable utilities and base types for all Vanguard Engine components.

Currently provides:
- **logger/** — Pino-based structured logging (ADR-013 compliant)

---

## Logger Module

### Purpose

Provides deterministic, structured JSON logging for all engine components with built-in support for request/operation tracing via child context bindings.

**Key characteristics:**
- Deterministic output format (consistent JSON field ordering)
- Structured logging with event-based context
- Child logger support for scan_id and other context fields
- Component-level field tracking (component name is mandatory)

### Usage

#### Basic Logger Creation

```typescript
import { createLogger } from "../shared/index.js";

const logger = createLogger("my_component");
logger.info({ event: "startup" }, "Component started");
```

#### With Child Context (Scan Tracing)

```typescript
const logger = createLogger("orchestrator");
const scanLog = logger.child({ scan_id: "abc123" });
scanLog.info({ event: "plan.start" }, "Generating plan");
```

#### Convenience Functions

```typescript
import { createScanLogger, withContext } from "../shared/index.js";

// Create scan-aware logger in one call
const log = createScanLogger(logger, scanId);

// Add multiple context fields
const log = withContext(logger, { scan_id: "xyz", retry_attempt: 2 });
```

### Log Context Format (Deterministic)

All log calls accept a context object (first argument) and message (second argument):

```typescript
log.info(
  { 
    event: "action.execute",
    action_id: "abc",
    order: 1,
    dry_run: true
  },
  "Executing action"
);
```

**Output (pretty-printed):**
```json
{
  "level": 30,
  "time": "2026-06-20T08:30:45.123Z",
  "component": "action_layer",
  "scan_id": "abc123",
  "event": "action.execute",
  "action_id": "abc",
  "order": 1,
  "dry_run": true,
  "msg": "Executing action"
}
```

### Configuration

**Log Level:** Control via `LOG_LEVEL` environment variable
```bash
LOG_LEVEL=debug npm run build
```

Default: `"info"`

Supported levels: `trace`, `debug`, `info`, `warn`, `error`, `fatal`

### API Reference

#### `createLogger(component: string): Logger`

Create a root logger for a component.

```typescript
const logger = createLogger("action_layer");
```

**Parameters:**
- `component` — Component identifier (will be set as base field in all logs)

**Returns:** Configured pino Logger instance

---

#### `createChildLogger(parent: Logger, bindings: LogContext): Logger`

Create a child logger with additional context.

```typescript
const scanLog = createChildLogger(logger, { scan_id: "xyz123" });
```

**Parameters:**
- `parent` — Parent logger to derive from
- `bindings` — Context object to merge (e.g., `{ scan_id, request_id }`)

**Returns:** Child logger with inherited + new context

---

#### `createScanLogger(parent: Logger, scanId: string): Logger`

Convenience: create a scan-aware child logger.

```typescript
const log = createScanLogger(logger, scanId);
```

Equivalent to: `logger.child({ scan_id: scanId })`

---

#### `withContext(logger: Logger, context: LogContext): Logger`

Add multiple context fields to a logger.

```typescript
const log = withContext(logger, { scan_id: "abc", attempt: 2, phase: "retry" });
```

---

### Type Exports

#### `Logger`

Pino logger instance type. Use for type annotations:

```typescript
import type { Logger } from "../shared/index.js";

export class MyComponent {
  constructor(private logger: Logger) {}
}
```

#### `LogContext`

Structured logging context interface:

```typescript
export interface LogContext extends Record<string, unknown> {
  event?: string;
  scan_id?: string;
  component?: string;
  [key: string]: unknown;
}
```

---

## ADR-013 Compliance

This logger implementation satisfies all ADR-013 requirements:

| Requirement | Status |
|---|---|
| Pino-based structured logging | ✅ |
| Field wajib: `component` | ✅ Set at logger creation |
| Field wajib: `scan_id` | ✅ Via child context |
| Deterministic output format | ✅ JSON field ordering stable |
| Child logger support | ✅ `createChildLogger()`, `createScanLogger()`, `withContext()` |
| LOG_LEVEL environment variable | ✅ Supported |

---

## Integration with Engine Components

### Action Layer
```typescript
import { createLogger } from "../shared/index.js";

const logger = createLogger("action_layer");
const execLog = logger.child({ scan_id: input.plan.scan_id });
execLog.info({ event: "execution.start" }, "Starting action execution");
```

### Orchestrator
```typescript
import { createScanLogger } from "../shared/index.js";

const logger = createLogger("orchestrator");
const log = createScanLogger(logger, brief.scan_id);
log.info({ event: "orchestrate.start" }, "Orchestrator started");
```

### Ports & Shared Utilities
```typescript
import { createLogger } from "../shared/index.js";

// Use same pattern as other components
const logger = createLogger("LLM_client");
logger.debug({ event: "api.call" }, "Calling LLM API");
```

---

## Best Practices

1. **Create logger once per component** — at module/class initialization
   ```typescript
   const logger = createLogger("my_component");
   ```

2. **Use child loggers for request/operation tracing**
   ```typescript
   const log = logger.child({ scan_id, request_id });
   ```

3. **Always include event field in structured logs**
   ```typescript
   log.info({ event: "action.complete", status: "success" }, "Action completed");
   ```

4. **Never log sensitive data (credentials, API keys)**
   — Use `credentialScrubber` if logging plan data

5. **Use appropriate log levels**
   - `debug` — detailed diagnostic info
   - `info` — significant events (action start/end, API calls)
   - `warn` — recoverable issues (retry, fallback)
   - `error` — unrecoverable errors
   - `fatal` — system shutdown required

---

## Future Extensions

Potential additions (deferred post-OPERATION SIDEWINDER):
- Structured error logging utilities
- Request correlation helpers
- Metrics/duration tracking helpers
- Custom serializers for common types

---

*Owner: Division Golf (Cursor 4) / Claude F18*  
*Governed by: ADR-013, Master_Doctrine.md*
