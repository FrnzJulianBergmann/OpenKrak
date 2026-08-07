// engine/core/deepstrikeImpl/astParser.ts
// Step 3 â€” AST Parsing
// ADR-004: @typescript-eslint/typescript-estree untuk TS/JS
// deepstrike.md Â§5.0 dual-parser architecture

import { parse, simpleTraverse } from "@typescript-eslint/typescript-estree";
import type { TSESTree } from "@typescript-eslint/typescript-estree";
import path from "path";
import fs from "fs";

export interface ParseResult {
  ast: TSESTree.Program;
  filePath: string;
  hasTypeInfo: boolean;
}

export function parseFile(filePath: string, content: string, repoRoot: string): ParseResult {
  // Check for tsconfig to enable type-aware parsing
  const tsconfigPath = findTsConfig(repoRoot);
  const isTypeScript = filePath.endsWith(".ts") || filePath.endsWith(".tsx");

  try {
    const ast = parse(content, {
      jsx: filePath.endsWith(".tsx") || filePath.endsWith(".jsx"),
      loc: true,
      range: true,
      tokens: false,
      comment: false,
      errorOnUnknownASTType: false,
      // Suppress "unsupported TS version" warning from leaking into TUI stdout
      loggerFn: false,
    });

    return { ast, filePath, hasTypeInfo: isTypeScript && tsconfigPath !== null };
  } catch {
    // Return minimal AST on parse failure â€” do not throw
    const emptyAst = parse("", { loc: true, range: true });
    return { ast: emptyAst, filePath, hasTypeInfo: false };
  }
}

function findTsConfig(repoRoot: string): string | null {
  const candidate = path.join(repoRoot, "tsconfig.json");
  return fs.existsSync(candidate) ? candidate : null;
}

export { simpleTraverse };
export type { TSESTree };

