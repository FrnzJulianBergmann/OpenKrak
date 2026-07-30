// engine/core/deepstrikeImpl/complexityExtractor.ts
// Complexity extraction from AST
// DeepStrike owns cyclomatic/cognitive computation
// Output written to FileIndexEntry.complexity
// Commander Decision P2: complexity is DeepStrike authority

import type { TSESTree } from "@typescript-eslint/typescript-estree";

export interface ComplexityMetrics {
  cyclomatic: number | null;
  cognitive: number | null;
  loc: number;
}

/**
 * Minimal generic AST walker with enter/leave hooks.
 * @typescript-eslint/typescript-estree's simpleTraverse only exposes
 * `enter` (no `leave`, no parent pointers). Function-scope tracking here
 * requires both, so we walk manually using the duck-typed ESTree node
 * shape ({ type: string, ...childProps }).
 */
function walkAst(
  node: unknown,
  onEnter: (node: TSESTree.Node) => void,
  onLeave: (node: TSESTree.Node) => void,
): void {
  if (!node || typeof node !== "object" || !("type" in node)) return;
  const n = node as TSESTree.Node;
  onEnter(n);

  for (const key of Object.keys(n)) {
    if (key === "type" || key === "loc" || key === "range" || key === "parent") continue;
    const value = (n as unknown as Record<string, unknown>)[key];
    if (Array.isArray(value)) {
      for (const child of value) {
        walkAst(child, onEnter, onLeave);
      }
    } else if (value && typeof value === "object" && "type" in (value as Record<string, unknown>)) {
      walkAst(value, onEnter, onLeave);
    }
  }

  onLeave(n);
}

/**
 * Cyclomatic complexity — count decision points
 * Thresholds per AST node type:
 * - if/else-if chains: +1 per branch
 * - switch cases: +1 per case
 * - logical AND/OR: +1 per binary expression
 * - ternary: +1
 * - loops (for/while/do): +1
 * - catch clauses: +1
 *
 * Baseline = 1 (at least one path through function)
 */
export function extractCyclomaticComplexity(
  ast: TSESTree.Program,
  filePath: string,
): Map<string, number> {
  const fileMetrics = new Map<string, number>();
  const functionStack: string[] = []; // track function nesting via stack, not parent pointer

  walkAst(
    ast,
    (node) => {
      // Track function scope — push to stack
      if (node.type === "FunctionDeclaration") {
        const name = (node as any).id?.name ?? "anonymous";
        const key = `${filePath}::(${name}):${node.loc?.start.line ?? 0}`;
        fileMetrics.set(key, 1); // baseline
        functionStack.push(key);
      } else if (node.type === "ArrowFunctionExpression" || node.type === "FunctionExpression") {
        // Arrow/function expression: use line number as unique key (parent not available)
        const key = `${filePath}::func_${node.loc?.start.line ?? 0}`;
        fileMetrics.set(key, 1); // baseline
        functionStack.push(key);
      }

      if (functionStack.length === 0) return;

      const currentFunction = functionStack[functionStack.length - 1]!;

      // Count decision points in current function scope
      switch (node.type) {
        case "IfStatement":
          fileMetrics.set(currentFunction, (fileMetrics.get(currentFunction) ?? 1) + 1);
          break;
        case "SwitchCase":
          fileMetrics.set(currentFunction, (fileMetrics.get(currentFunction) ?? 1) + 1);
          break;
        case "WhileStatement":
        case "DoWhileStatement":
        case "ForStatement":
        case "ForInStatement":
        case "ForOfStatement":
          fileMetrics.set(currentFunction, (fileMetrics.get(currentFunction) ?? 1) + 1);
          break;
        case "TryStatement":
          // Each catch block adds complexity
          if ((node as any).handler) {
            fileMetrics.set(currentFunction, (fileMetrics.get(currentFunction) ?? 1) + 1);
          }
          break;
        case "ConditionalExpression":
          fileMetrics.set(currentFunction, (fileMetrics.get(currentFunction) ?? 1) + 1);
          break;
        case "LogicalExpression":
          if ((node as TSESTree.LogicalExpression).operator === "||" || 
              (node as TSESTree.LogicalExpression).operator === "&&") {
            fileMetrics.set(currentFunction, (fileMetrics.get(currentFunction) ?? 1) + 1);
          }
          break;
      }
    },
    (node) => {
      // Pop function context from stack
      if (
        node.type === "FunctionDeclaration" ||
        node.type === "ArrowFunctionExpression" ||
        node.type === "FunctionExpression"
      ) {
        functionStack.pop();
      }
    },
  );

  return fileMetrics;
}

/**
 * Cognitive complexity — approximation
 * Similar to cyclomatic but:
 * - Nested conditions get bonus (depth × 0.5)
 * - Else-if chains not penalized (same as single if)
 * - Recursion: +1
 */
export function extractCognitiveComplexity(
  ast: TSESTree.Program,
  filePath: string,
): Map<string, number> {
  // Deferred to future enhancement — return null for now per schema v2.1
  return new Map();
}

/**
 * File-level complexity (LOC-based heuristic)
 * If LOC > threshold → mark as high complexity file
 * LOC extracted from line count during parse
 */
export function fileComplexityFromLOC(loc: number): "high" | "medium" | "low" {
  if (loc > 500) return "high";
  if (loc > 200) return "medium";
  return "low";
}

// nodeToKey removed — use function stack instead of parent pointers (simpleTraverse doesn't provide parent)
