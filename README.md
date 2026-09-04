# openkrak-mcp

MCP server for developer tooling. Performs static analysis on a software repository via the Dorchester engine and delivers a structured context brief to the language model before any file is accessed.

**Current integration:** OpenCode. Claude Code, Codex, and Cursor support in development.

---

## How It Works

OpenKrak runs the **Dorchester engine** — a six-step static analysis pipeline — on your repository before the language model executes any task.

```
Repository
    │
    ▼
DeepStrike          — Full static analysis: every import, export, coupling resolved
    │
    ▼
Hotspot Registry    — Files ranked by complexity, change frequency, cognitive load
    │
    ▼
Correlation Engine  — Dependency chains traced across the entire codebase
    │
    ▼
Blast Radius        — Ripple effects of any change mapped before commit
    │
    ▼
Execution Gate      — Analysis validated and normalized
    │
    ▼
Mahadata            — Structured brief delivered to the language model
```

All analysis runs locally. Your codebase does not leave your machine.

---

## Install

```bash
npm install -g openkrak-mcp
```

Requires Node.js ≥ 18.

---

## Setup — OpenCode

**Step 1.** Open `~/.config/opencode/opencode.jsonc` and add the `mcp` block:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "openkrak": {
      "type": "local",
      "enabled": true,
      "command": ["npx", "openkrak-mcp"]
    }
  }
}
```

> Windows: `C:\Users\<username>\.config\opencode\opencode.jsonc`  
> macOS / Linux: `~/.config/opencode/opencode.jsonc`

**Step 2.** Restart OpenCode. Confirm **openkrak Connected** appears in the MCP panel.

**Step 3.** Open any repository and run a coding task. OpenKrak runs automatically before the language model accesses any file.

To invoke explicitly:
```
Use analyze_repo on /path/to/your/repo with objective "refactor the auth module"
```

---

## Enabling and Disabling

Set `"enabled"` in your config and restart OpenCode:

```jsonc
"enabled": true   // on
"enabled": false  // off
```

---

## Tools

| Tool | Description |
|------|-------------|
| `analyze_repo` | Full Dorchester pipeline. Returns dependency graph, hotspot rankings, blast radius, and threat matrix. Call before any coding task. |
| `get_mahadata` | Compact repository intelligence brief. Structure, entry points, constraints, risk score. |
| `get_hotspots` | Ranked list of high-risk files by complexity, coupling, and change frequency. |
| `blast_radius` | Impact map for a specific file change. Which files, modules, and APIs are affected. |

---

## License Tiers

Free tier is active by default — no account or configuration required.

| Plan | Price | Queries |
|------|-------|---------|
| Free | $0 | 15 per 24-hour rolling window |
| Pro Monthly | $8 / month | Unlimited |
| Pro Annual | $67.20 / year | Unlimited |

To activate a Pro license, add your key to the MCP config:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "openkrak": {
      "type": "local",
      "enabled": true,
      "command": ["npx", "openkrak-mcp"],
      "env": {
        "OPENKRAK_KEY": "your-license-key"
      }
    }
  }
}
```

License keys are available at [openkrak-web.vercel.app](https://openkrak-web.vercel.app). Delivered instantly via email after purchase. No subscription, no auto-renewal.

---

## Notes

- Static analysis only. No AI inference in the pipeline.
- Anonymous usage telemetry is collected (query count, tool name, error events). No source code or file contents are transmitted.
- License validation requires a network call to verify your key against the license server.

---

## Repository

[github.com/FrnzJulianBergmann/openkrak](https://github.com/FrnzJulianBergmann/openkrak)

---

MIT License — © 2026 Faiz Hamizan / Challanger Absolute Advance
