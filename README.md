# openkrak-mcp

**AI coding intelligence for any coding agent — delivered as an MCP server.**

OpenKrak pre-computes your repository's structure and delivers a structured intelligence brief (Mahadata) before your LLM runs. Less hallucination, lower token cost, faster answers.

---

## The Problem

Every time you ask Claude Code, OpenCode, or Cursor to modify code, the LLM starts blind — reading raw files, burning tokens, guessing dependencies.

**Without OpenKrak:** LLM reads 50,000 tokens of raw files. Slow. Expensive. Blind.  
**With OpenKrak:** LLM reads a pre-computed Mahadata brief. Precise. Cheap. Aware.

---

## How It Works

OpenKrak runs the **Dorchester engine** — a 6-step static analysis pipeline:

```
Repository → DeepStrike → Hotspot Registry → Correlation Engine → Blast Radius → Execution Gate → Mahadata
```

The result is delivered as a structured brief to your coding agent via MCP before any code is touched.

---

## Install

```bash
npm install -g openkrak-mcp
```

## Usage

### OpenCode
```json
// ~/.config/opencode/opencode.jsonc
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

### Claude Code
```json
// ~/.claude/mcp.json
{
  "mcpServers": {
    "openkrak": {
      "command": "npx",
      "args": ["openkrak-mcp"],
      "env": { "OPENKRAK_KEY": "your-license-key" }
    }
  }
}
```

### Activate Pro (optional)
```bash
OPENKRAK_KEY=your-key npx openkrak-mcp
```

---

## Tools

| Tool | Description |
|------|-------------|
| `analyze_repo` | Full Dorchester pipeline — dependency graph, hotspots, blast radius, threat matrix |
| `get_mahadata` | Compact 500-token intelligence brief for fast LLM context |
| `get_hotspots` | Ranked list of high-risk files by complexity, coupling, change frequency |
| `blast_radius` | Ripple effect map of modifying a specific file |

---

## Pricing

| Plan | Price | Limit |
|------|-------|-------|
| Free | $0 | 15 calls / 24h |
| Pro Monthly | $8/month | Unlimited |
| Pro Annual | $67.20/year | Unlimited |

Get a Pro key at **[openkrak.dev](https://openkrak.dev)**

---

## Tech

- Protocol: MCP (Model Context Protocol) — open standard
- Analysis: Static, deterministic — not AI/probabilistic
- Privacy: Codebase never leaves your machine (Phase 1)
- Compatible: Any MCP-compatible agent (OpenCode, Claude Code, Cursor, Codex)

---

## License

MIT — © 2026 Faiz Hamizan
