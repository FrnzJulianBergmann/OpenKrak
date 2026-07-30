// engine/core/deepstrikeImpl/dependencyResolver.ts
// Step 5 — Dependency Resolution
// deepstrike.md §5.1 step 5
// Handles: import, call, extend, implement, barrel dual-edge (§4.1.3)

import type { TSESTree } from "@typescript-eslint/typescript-estree";
import { simpleTraverse } from "@typescript-eslint/typescript-estree";
import type { DependencyEdge } from "../../contracts/index.js";
import path from "path";

export interface RawEdge {
  from: string;   // node_id
  to: string;     // node_id or unresolved import path
  kind: DependencyEdge["kind"];
  file: string;
  line: number | null;
  is_dynamic: boolean;
  is_barrel_import: boolean;
  resolved_via: string | null;
}

/** Re-export entry extracted from barrel index.ts files */
export interface BarrelReExport {
  barrelFile: string;       // e.g. "src/services/index.ts"
  exportedName: string;     // local exported name, or "*" for wildcard
  sourceFile: string;       // resolved path of the actual source file
}

export function extractRawEdges(
  filePath: string,
  ast: TSESTree.Program,
  fileNodeId: string,
): RawEdge[] {
  const edges: RawEdge[] = [];

  // First pass: collect all class/method declarations with their line ranges.
  // NOTE: current @typescript-eslint/typescript-estree's simpleTraverse only
  // supports `enter` (no `leave`/exit hook), so we can't maintain a
  // push/pop class stack during traversal. Instead, since classes are
  // always visited before their own methods in a top-down AST walk, we
  // resolve "current enclosing class" by looking up the tightest class
  // range already collected in symbolRanges at the method's line — no
  // stack needed.
  interface SymbolRange { nodeId: string; startLine: number; endLine: number; kind: "class" | "method"; name: string; }
  const symbolRanges: SymbolRange[] = [];

  simpleTraverse(ast, {
    enter(node) {
      if (node.type === "ClassDeclaration" && node.id && node.loc) {
        const className = node.id.name;
        const classNodeId = `${filePath}::${className}::${node.loc.start.line}`;
        symbolRanges.push({
          nodeId: classNodeId,
          startLine: node.loc.start.line,
          endLine: node.loc.end.line,
          kind: "class",
          name: className,
        });
      }
      if (node.type === "MethodDefinition" && node.key.type === "Identifier" && node.loc) {
        const methodName = node.key.name;
        if (methodName === "constructor") return;
        const line = node.loc.start.line;

        // Tightest enclosing class already known at this point in the walk
        const enclosingClass = symbolRanges
          .filter((r) => r.kind === "class" && r.startLine <= line && line <= r.endLine)
          .sort((a, b) => (a.endLine - a.startLine) - (b.endLine - b.startLine))[0];

        const qualifiedName = enclosingClass ? `${enclosingClass.name}.${methodName}` : methodName;
        const methodNodeId = `${filePath}::${qualifiedName}::${line}`;
        symbolRanges.push({
          nodeId: methodNodeId,
          startLine: line,
          endLine: node.loc.end.line,
          kind: "method",
          name: qualifiedName,
        });
      }
    },
  });

  // Helper: find tightest enclosing symbol at a given line
  const getEnclosingNodeId = (line: number): string => {
    let best: SymbolRange | null = null;
    for (const r of symbolRanges) {
      if (r.startLine <= line && line <= r.endLine) {
        if (!best || (r.endLine - r.startLine) < (best.endLine - best.startLine)) {
          best = r;
        }
      }
    }
    return best?.nodeId ?? fileNodeId;
  };

  // Primary class for import attribution — imports go from class node, not file node
  const classNodes = symbolRanges.filter(r => !r.nodeId.split("::")[1]?.includes("."));
  const importFromNodeId = classNodes.length === 1 ? classNodes[0].nodeId : fileNodeId;

  simpleTraverse(ast, {
    enter(node) {
      // Static imports — emit from primary class and file node only
      if (node.type === "ImportDeclaration") {
        const importPath = node.source.value as string;
        const line = node.loc?.start.line ?? null;
        const isBarrel = isBarrelPath(importPath);
        const resolvedTarget = resolveImportTarget(filePath, importPath);

        edges.push({
          from: importFromNodeId,
          to: resolvedTarget,
          kind: "import",
          file: filePath,
          line,
          is_dynamic: false,
          is_barrel_import: false,
          resolved_via: null,
        });
        if (importFromNodeId !== fileNodeId) {
          edges.push({
            from: fileNodeId,
            to: resolvedTarget,
            kind: "import",
            file: filePath,
            line,
            is_dynamic: false,
            is_barrel_import: false,
            resolved_via: null,
          });
        }
      }

      // Dynamic imports: import('./foo')
      if (node.type === "ImportExpression") {
        const line = node.loc?.start.line ?? null;
        const sourceLiteral =
          node.source.type === "Literal" ? (node.source.value as string) : "<dynamic>";
        edges.push({
          from: fileNodeId,
          to: resolveImportTarget(filePath, sourceLiteral),
          kind: "dynamic_import",
          file: filePath,
          line,
          is_dynamic: true,
          is_barrel_import: false,
          resolved_via: null,
        });
      }

      // Class extends
      if (node.type === "ClassDeclaration" && node.superClass && node.loc) {
        const superName =
          node.superClass.type === "Identifier" ? node.superClass.name : "<unknown>";
        edges.push({
          from: fileNodeId,
          to: superName, // resolved to node_id in assembly
          kind: "extend",
          file: filePath,
          line: node.loc.start.line,
          is_dynamic: false,
          is_barrel_import: false,
          resolved_via: null,
        });
      }

      // implements clauses (TSClassImplements)
      if (node.type === "ClassDeclaration" && node.implements) {
        for (const impl of node.implements) {
          if (impl.expression.type === "Identifier" && node.loc) {
            edges.push({
              from: fileNodeId,
              to: impl.expression.name,
              kind: "implement",
              file: filePath,
              line: node.loc.start.line,
              is_dynamic: false,
              is_barrel_import: false,
              resolved_via: null,
            });
          }
        }
      }

      // Call expressions — attribute to enclosing method node
      if (node.type === "CallExpression" && node.loc) {
        const line = node.loc.start.line;
        const fromId = getEnclosingNodeId(line);
        const callee = node.callee;

        // this.repo.findById() → resolve to known method nodes in symbolRanges
        if (callee.type === "MemberExpression" && callee.property.type === "Identifier") {
          const methodName = callee.property.name;
          // Find matching method in symbolRanges — exclude same file (cross-file calls only here)
          const targetNode = symbolRanges.find(r => {
            const parts = r.nodeId.split("::");
            const rMethodName = parts[1]?.split(".").pop();
            return rMethodName === methodName && r.nodeId !== fromId && r.nodeId !== importFromNodeId;
          });
          if (targetNode && targetNode.nodeId !== fromId) {
            edges.push({
              from: fromId,
              to: targetNode.nodeId,
              kind: "call",
              file: filePath,
              line,
              is_dynamic: false,
              is_barrel_import: false,
              resolved_via: null,
            });
          } else {
            // Emit as bare name for cross-file resolution in assembly
            edges.push({
              from: fromId,
              to: methodName,
              kind: "call",
              file: filePath,
              line,
              is_dynamic: false,
              is_barrel_import: false,
              resolved_via: null,
            });
          }
        }
      }
    },
  });

  return edges;
}

/**
 * Extract re-export declarations from barrel files.
 * Call this for every file to build a global barrel export map.
 * Returns BarrelReExport[] — empty for non-barrel files.
 */
export function extractBarrelReExports(
  filePath: string,
  ast: TSESTree.Program,
): BarrelReExport[] {
  const reExports: BarrelReExport[] = [];

  simpleTraverse(ast, {
    enter(node) {
      // export * from './foo'
      // export { X, Y } from './foo'
      if (node.type === "ExportAllDeclaration" || node.type === "ExportNamedDeclaration") {
        if (!node.source) return;
        const sourcePath = node.source.value as string;
        if (!sourcePath.startsWith(".")) return;
        const resolvedSource = resolveImportTarget(filePath, sourcePath);

        if (node.type === "ExportAllDeclaration") {
          reExports.push({
            barrelFile: filePath,
            exportedName: "*",
            sourceFile: resolvedSource,
          });
        } else if (node.type === "ExportNamedDeclaration" && node.specifiers) {
          for (const spec of node.specifiers) {
            if (spec.type === "ExportSpecifier") {
              reExports.push({
                barrelFile: filePath,
                exportedName: spec.exported.type === "Identifier" ? spec.exported.name : "*",
                sourceFile: resolvedSource,
              });
            }
          }
        }
      }
    },
  });

  return reExports;
}

export function resolveImportTarget(fromFile: string, importPath: string): string {
  if (importPath.startsWith(".")) {
    const dir = path.dirname(fromFile);
    const resolved = path.join(dir, importPath).replace(/\\/g, "/");
    // Normalize: strip .js → .ts for TypeScript projects
    const normalized = resolved.replace(/\.js$/, ".ts");
    // Add .ts extension if no extension
    if (!path.extname(normalized)) {
      return normalized + ".ts";
    }
    return normalized;
  }
  // External package — return as-is
  return importPath;
}

function isBarrelPath(importPath: string): boolean {
  return importPath.endsWith("/index") ||
    importPath.endsWith("/index.ts") ||
    importPath.endsWith("/index.js") ||
    importPath === "index";
}
