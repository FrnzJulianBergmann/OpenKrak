// src/tool/power-mode-toggle.ts
// Power Mode toggle command — registers "/power" in the command palette
// When enabled: Dorchester engine runs before every LLM call and its
// analysis is injected into the system prompt automatically.
// When disabled: stock OpenCode behaviour, no engine overhead.
import { Effect } from "effect"
import { Session } from "@/session/session"

export const POWER_MODE_META_KEY = "openkrak_power_mode"

export function isPowerModeEnabled(session: Session.Info): boolean {
  return session.metadata?.[POWER_MODE_META_KEY] === true
}

export const powerModeToggleCommand = {
  name: "power",
  description: "Toggle Power Mode (Dorchester engine auto-analysis before every reply)",
  template: Promise.resolve(""),
  hints: [],
  source: "command" as const,
  subtask: false,
  // The actual toggle logic lives in the TUI handler (see power-mode-toggle handler)
}
