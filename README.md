# openkrak-mcp

MCP server for developer tooling. Performs static analysis on a software repository via the Dorchester engine and delivers a structured context brief to the language model before any file is accessed.

**Supported:** OpenCode (TUI + Desktop). Claude Code, Codex, and Cursor support in development.

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

## Setup

OpenKrak works with both **OpenCode TUI** and **OpenCode Desktop**. The config file and setup steps are identical for both.

### Config file location

| Platform | Path |
|----------|------|
| Windows | `C:\Users\<username>\.config\opencode\opencode.jsonc` |
| macOS | `~/.config/opencode/opencode.jsonc` |
| Linux | `~/.config/opencode/opencode.jsonc` |

### Step 1 — Add OpenKrak to your config

Open the config file and add the `mcp` block:

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

### Step 2 — Restart OpenCode

Close and reopen OpenCode (TUI or Desktop). Confirm **openkrak Connected** appears in the MCP panel.

> **OpenCode Desktop:** MCP status is shown in the bottom status bar. Green dot = connected.  
> **OpenCode TUI:** MCP status is shown in the top-right panel.

### Step 3 — Run your first analysis

Open any repository in OpenCode and send a message:

```
analyze_repo on /absolute/path/to/your/repo
```

Or just start a coding task normally — OpenKrak runs automatically before the model reads any file.

---

## Tools

| Tool | When to use |
|------|-------------|
| `analyze_repo` | Full pipeline. Call before any coding task on a new repo. Returns dependency graph, hotspot rankings, blast radius, and threat matrix. |
| `get_mahadata` | Compact repo brief — structure, entry points, constraints, risk score. Use when you need repo-wide context without a full re-analysis. |
| `get_hotspots` | Ranked list of high-risk files by complexity, coupling, and change frequency. Use before reviewing or refactoring. |
| `blast_radius` | Impact map for a specific file. Which files, modules, and APIs are affected by a change. Use before modifying a critical file. |

### Example prompts

```
analyze_repo on /path/to/repo with objective "refactor the auth module"
```
```
Run get_hotspots on /path/to/repo — which files should I avoid touching?
```
```
blast_radius on /path/to/repo for file src/api/routes/user.ts
```

---

## Enable / Disable

Set `"enabled"` in your config and restart OpenCode:

```jsonc
"enabled": true   // on
"enabled": false  // off
```

---

## Pro License

Free tier is active by default — no account required.

| Plan | Price | Queries |
|------|-------|---------|
| Free | $0 | 15 per 24-hour rolling window |
| Pro Monthly | $8 / month | Unlimited |
| Pro Annual | $67.20 / year | Unlimited |

To activate Pro, add your key to the config:

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

License keys: [openkrak-web.vercel.app](https://openkrak-web.vercel.app). Delivered via email after purchase. No subscription, no auto-renewal.

---

## Notes

- Static analysis only. No AI inference in the pipeline.
- Anonymous usage telemetry is collected (query count, tool name, error events). No source code or file contents are transmitted.
- License validation requires a network call to the license server on each tool invocation.

---

## Repository

[github.com/FrnzJulianBergmann/openkrak](https://github.com/FrnzJulianBergmann/openkrak)

---

MIT License — © 2026 Faiz Hamizan / Challanger Absolute Advance
