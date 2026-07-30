// engine/core/deepstrikeImpl/symbolDiscovery.ts
// Step 4 — Symbol Discovery
// deepstrike.md §4.1.1 — qualified_symbol_name rules (FINAL/FROZEN)
// deepstrike.md §4.1.2 — anonymous callbacks: NO node, edge only

import type { TSESTree } from "@typescript-eslint/typescript-estree";
import { simpleTraverse } from "@typescript-eslint/typescript-estree";
import type { DependencyNode, NodeKind } from "../../contracts/index.js";

export function buildNodeId(filePath: string, qualifiedName: string, lineStart: number): string {
  return `${filePath}::${qualifiedName}::${lineStart}`;
}

export function discoverSymbols(
  filePath: string,
  ast: TSESTree.Program,
): DependencyNode[] {
  const nodes: DependencyNode[] = [];
  const lang = inferLanguage(filePath);

  // File-level node always present (§4.4.1: file, line_start=0)
  nodes.push({
    id: buildNodeId(filePath, "file", 0),
    kind: "file",
    name: "file",
    file: filePath,
    line_start: 0,
    line_end: null,
    language: lang,
    content_hash: "", // set by caller after hashing
    is_exported: false,
    is_entry_point: false,
    module: null,
  });

  // Track enclosing class ranges for method qualified names.
  // NOTE: current @typescript-eslint/typescript-estree's simpleTraverse only
  // supports `enter` (no `leave`/exit hook). Classes are always visited
  // before their own methods in a top-down walk, so instead of a
  // push/pop stack we look up the tightest already-discovered class range
  // that contains the method's line.
  interface ClassRange { name: string; startLine: number; endLine: number; }
  const classRanges: ClassRange[] = [];

  simpleTraverse(ast, {
    enter(node) {
      // Barrel re-export: emit per-symbol variable nodes matching GT spec
      if (node.type === "ExportNamedDeclaration" && (node as any).source && (node as any).specifiers?.length > 0) {
        for (const spec of (node as any).specifiers) {
          const exportedName = spec.exported?.name ?? spec.local?.name;
          if (!exportedName) continue;
          const line = node.loc?.start.line ?? 1;
          const key = `re_export:${exportedName}`;
          if (nodes.some((n) => n.name === key)) continue;
          nodes.push(makeNode(filePath, key, key, "variable", lang, node.loc ?? { start: { line, column: 0 }, end: { line, column: 0 } } as TSESTree.SourceLocation, true));
        }
        return;
      }
      // export * from './foo' — emit single barrel variable
      if (node.type === "ExportAllDeclaration" && (node as any).source) {
        if (nodes.some((n) => n.kind === "variable" && n.name.startsWith("re_export:"))) return;
        const fakeLoc = { start: { line: node.loc?.start.line ?? 1, column: 0 }, end: { line: node.loc?.start.line ?? 1, column: 0 } };
        nodes.push(makeNode(filePath, "re_export:*", "re_export:*", "variable", lang, fakeLoc as TSESTree.SourceLocation, true));
        return;
      }

      if (node.type === "ClassDeclaration") {
        const className = node.id?.name ?? "<anonymous>";
        if (node.loc) {
          classRanges.push({ name: className, startLine: node.loc.start.line, endLine: node.loc.end.line });
        }
        if (node.id && node.loc) {
          const exported = isNodeExported(node);
          nodes.push(makeNode(filePath, className, className, "class", lang, node.loc, exported));
        }
        return;
      }

      if (node.type === "MethodDefinition") {
        if (!node.key || node.key.type !== "Identifier" || !node.loc) return;
        const methodName = node.key.name;
        // Skip constructors — not in GT spec
        if (methodName === "constructor") return;
        const line = node.loc.start.line;
        const currentClass = classRanges
          .filter((r) => r.startLine <= line && line <= r.endLine)
          .sort((a, b) => (a.endLine - a.startLine) - (b.endLine - b.startLine))[0];
        const qualifiedName = currentClass ? `${currentClass.name}.${methodName}` : methodName;
        nodes.push(makeNode(filePath, qualifiedName, methodName, "method", lang, node.loc, false));
        return;
      }

      const symbol = extractSymbol(node, filePath, lang);
      if (symbol) nodes.push(symbol);
    },
  });

  return nodes;
}

function extractSymbol(node: TSESTree.Node, filePath: string, lang: string): DependencyNode | null {
  switch (node.type) {
    case "FunctionDeclaration": {
      if (!node.id || !node.loc) return null;
      return makeNode(filePath, node.id.name, node.id.name, "function", lang, node.loc, isNodeExported(node));
    }

    // ClassDeclaration and MethodDefinition handled in discoverSymbols directly
    case "ClassDeclaration":
    case "MethodDefinition":
      return null;

    case "TSInterfaceDeclaration": {
      if (!node.id || !node.loc) return null;
      return makeNode(filePath, node.id.name, node.id.name, "interface", lang, node.loc, isNodeExported(node));
    }

    case "TSEnumDeclaration": {
      if (!node.id || !node.loc) return null;
      return makeNode(filePath, node.id.name, node.id.name, "enum", lang, node.loc, isNodeExported(node));
    }

    case "TSTypeAliasDeclaration": {
      if (!node.id || !node.loc) return null;
      return makeNode(filePath, node.id.name, node.id.name, "type_alias", lang, node.loc, isNodeExported(node));
    }

    case "VariableDeclarator": {
      if (node.id.type !== "Identifier" || !node.loc) return null;
      const init = node.init;
      if (!init) return null;
      // Arrow/function expressions -> variable node
      if (init.type === "ArrowFunctionExpression" || init.type === "FunctionExpression") {
        return makeNode(filePath, node.id.name, node.id.name, "variable", lang, node.loc, false);
      }
      // Exported const (object, array, primitive, new expression) -> variable node
      // is_exported refined in assembly pass
      return makeNode(filePath, node.id.name, node.id.name, "variable", lang, node.loc, false);
    }

    default:
      return null;
  }
}

function makeNode(
  file: string,
  qualifiedName: string,
  name: string,
  kind: NodeKind,
  language: string,
  loc: TSESTree.SourceLocation,
  is_exported: boolean,
): DependencyNode {
  return {
    id: buildNodeId(file, qualifiedName, loc.start.line),
    kind,
    name,
    file,
    line_start: loc.start.line,
    line_end: loc.end.line,
    language,
    content_hash: "",
    is_exported,
    is_entry_point: false,
    module: null,
  };
}

function isNodeExported(node: TSESTree.Node): boolean {
  // Check if wrapped in ExportNamedDeclaration / ExportDefaultDeclaration
  // simpleTraverse doesn't give parent — approximation: check node's parent context
  // Full export detection handled in graph assembly pass
  return false; // conservative default; refined in assembly
}

function inferLanguage(filePath: string): string {
  if (filePath.endsWith(".ts") || filePath.endsWith(".tsx")) return "typescript";
  if (filePath.endsWith(".js") || filePath.endsWith(".jsx")) return "javascript";
  return "unknown";
}
