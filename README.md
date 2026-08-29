# openkrak-mcp

**AI coding intelligence for any coding agent — delivered as an MCP server.**

OpenKrak pre-computes your repository's structure and delivers a structured intelligence brief (Mahadata) before your LLM runs. Less hallucination, lower token cost, faster answers.

---

## The Problem

Every time you ask your coding agent to modify code, the LLM starts blind — reading raw files, burning tokens, guessing dependencies.

**Without OpenKrak:** LLM reads 50,000+ tokens of raw files. Slow. Expensive. Blind.  
**With OpenKrak:** LLM reads a pre-computed Mahadata brief. Precise. Cheap. Aware.

For simple tasks, OpenKrak replaces 50+ file reads with a single tool call.  
For complex refactors, it cuts token usage 20-30% and eliminates blind exploration — the LLM knows exactly which files matter before it reads a single line.

---

## How It Works

OpenKrak runs the **Dorchester engine** — a 6-step static analysis pipeline:

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
Mahadata            — Structured intelligence brief delivered to your coding agent
```

Your codebase never leaves your machine. All analysis runs locally.

---

## Supported Agents

| Agent | Status |
|-------|--------|
| **OpenCode** | ✅ Supported |
| Claude Code | 🔜 Coming soon |
| Codex | 🔜 Coming soon |
| Cursor | 🔜 Coming soon |

---

## Install

```bash
npm install -g openkrak-mcp
```

---

## Setup — OpenCode

### Step 1 — Edit config

Open `~/.config/opencode/opencode.jsonc` and add the `mcp` block:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "openkrak": {
      "type": "local",
      "enabled": true,
      "command": ["openkrak-mcp"]
    }
  }
}
```

> **Windows path:** `C:\Users\<username>\.config\opencode\opencode.jsonc`  
> **Mac/Linux path:** `~/.config/opencode/opencode.jsonc`

### Step 2 — Restart OpenCode

Close and reopen OpenCode. You should see **openkrak Connected** in the top-right MCP panel.

### Step 3 — Use it

Just open a repo and ask your agent anything. OpenKrak automatically runs before the LLM touches your files.

Or call it explicitly:

```
Use analyze_repo on /path/to/your/repo with objective "refactor the auth module"
```

---

## Turning OpenKrak On / Off

Change `"enabled"` in your config:

```jsonc
// ON
"enabled": true

// OFF
"enabled": false
```

Then restart OpenCode. That's it.

**Quick toggle scripts (optional):**

Save these two files anywhere on your machine.

`mcp-on.ps1` (Windows PowerShell):
```powershell
$config = Get-Content "$env:USERPROFILE\.config\opencode\opencode.jsonc" | ConvertFrom-Json -AsHashtable
$config.mcp.openkrak.enabled = $true
$config | ConvertTo-Json -Depth 10 | Set-Content "$env:USERPROFILE\.config\opencode\opencode.jsonc"
Write-Host "OpenKrak: ON"
```

`mcp-off.ps1` (Windows PowerShell):
```powershell
$config = Get-Content "$env:USERPROFILE\.config\opencode\opencode.jsonc" | ConvertFrom-Json -AsHashtable
$config.mcp.openkrak.enabled = $false
$config | ConvertTo-Json -Depth 10 | Set-Content "$env:USERPROFILE\.config\opencode\opencode.jsonc"
Write-Host "OpenKrak: OFF"
```

Run with:
```powershell
powershell -File mcp-on.ps1
powershell -File mcp-off.ps1
```

---

## Tools

Once connected, your coding agent has access to 4 tools:

| Tool | When to use |
|------|-------------|
| `analyze_repo` | Before any coding task — runs full Dorchester pipeline, returns dependency graph, hotspots, blast radius, threat matrix |
| `get_mahadata` | Quick 500-token intelligence brief — repo structure, entry points, constraints, risk score |
| `get_hotspots` | Which files are most dangerous to touch — ranked by complexity, coupling, change frequency |
| `blast_radius` | Ripple effect of modifying a specific file — which files, modules, APIs will be affected |

---

## Pro License (optional)

Free tier gives you **15 calls per 24 hours** — no account needed.

For unlimited calls, get a Pro key at **[openkrak.dev](https://openkrak.dev)**:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "openkrak": {
      "type": "local",
      "enabled": true,
      "command": ["openkrak-mcp"],
      "env": {
        "OPENKRAK_KEY": "your-license-key"
      }
    }
  }
}
```

| Plan | Price | Limit |
|------|-------|-------|
| Free | $0 | 15 calls / 24h rolling |
| Pro Monthly | $8/month | Unlimited |
| Pro Annual | $67.20/year | Unlimited |

---

## Privacy

- Your codebase **never leaves your machine**
- Analysis runs 100% locally via the Dorchester engine
- Only license validation calls hit the network (to verify your key)
- No telemetry, no file uploads

---

## Tech

- **Protocol:** MCP (Model Context Protocol) — open standard by Anthropic
- **Analysis:** Static, deterministic — not AI/probabilistic
- **Runtime:** Node.js ≥ 18
- **License:** MIT

---

## License

MIT — © 2026 Faiz Hamizan
