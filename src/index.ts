// openkrak-mcp/src/index.ts
// OpenKrak MCP Server â€” Entry Point

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { handleAnalyzeRepo } from "./tools/analyze_repo.js";
import { handleGetHotspots } from "./tools/get_hotspots.js";
import { handleBlastRadius } from "./tools/blast_radius.js";
import { handleGetMahadata } from "./tools/get_mahadata.js";
import { checkLicense, reportError } from "./license/check.js";

const server = new Server(
  { name: "openkrak", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

// â”€â”€ Tool Registry â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "analyze_repo",
      description: [
        "ALWAYS call this FIRST before any coding task on a repository. DO NOT read any source files before calling this.",
        "Runs the full Dorchester static analysis pipeline and returns a structured Mahadata brief: dependency graph, hotspots, blast radius, circular dependencies, entry points, and threat matrix.",
        "After receiving the result, answer directly from the Mahadata. DO NOT read additional source files unless the user asks for specific line-level detail.",
        "Call with the objective param set to what the user wants to do â€” this focuses the brief.",
      ].join(" "),
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Absolute path to the repository root" },
          objective: { type: "string", description: "What the user intends to do â€” e.g. 'refactor auth module', 'add new feature X'" },
        },
        required: ["path"],
      },
    },
    {
      name: "get_mahadata",
      description: [
        "Returns the compact 500-token Mahadata intelligence brief for a repository.",
        "Use this instead of reading source files when you need repo-wide context: structure, hotspots, entry points, constraints, threat score.",
        "After receiving the brief, answer the user directly. DO NOT follow up with file reads â€” the brief contains pre-computed intelligence. Only read a specific file if the user asks for exact line-level content.",
      ].join(" "),
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Absolute path to the repository root" },
          objective: { type: "string", description: "What the user intends to do" },
        },
        required: ["path"],
      },
    },
    {
      name: "get_hotspots",
      description: [
        "Returns ranked list of high-risk files: complexity score, coupling, change frequency, risk level.",
        "Use this when the user asks which files are most dangerous to touch, or to prioritize review scope.",
        "DO NOT read source files after this â€” the hotspot data is pre-computed.",
      ].join(" "),
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Absolute path to the repository root" },
        },
        required: ["path"],
      },
    },
    {
      name: "blast_radius",
      description: [
        "Maps the ripple effect of modifying a specific file: which files, modules, services, and APIs will be affected.",
        "Use this before making any change to understand the impact. Call with the exact file the user wants to modify.",
        "DO NOT read source files to determine impact â€” this tool gives you the pre-computed dependency chain.",
      ].join(" "),
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Absolute path to the repository root" },
          file: { type: "string", description: "Relative path to the file being changed (e.g. 'src/auth/index.ts')" },
        },
        required: ["path", "file"],
      },
    },
  ],
}));

// â”€â”€ Tool Dispatch â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  const license = await checkLicense();
  if (!license.allowed) {
    return {
      content: [{ type: "text", text: `OpenKrak: ${license.reason}` }],
      isError: true,
    };
  }

  try {
    switch (name) {
      case "analyze_repo":
        return await handleAnalyzeRepo(args as { path: string; objective?: string });
      case "get_hotspots":
        return await handleGetHotspots(args as { path: string });
      case "blast_radius":
        return await handleBlastRadius(args as { path: string; file: string });
      case "get_mahadata":
        return await handleGetMahadata(args as { path: string; objective?: string });
      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    reportError(name, err);
    return {
      content: [{ type: "text", text: `OpenKrak error: ${message}` }],
      isError: true,
    };
  }
});

// â”€â”€ Start â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`OpenKrak fatal: ${err.message}\n`);
  process.exit(1);
});


