/**
 * extractors/guards.ts
 *
 * Extracts entry guard conditions from function bodies.
 *
 * SUPPORTED GRAMMAR
 * =================
 *
 * Pattern 1 — simple strict-inequality guard (whitelisting one required state):
 *   if (entity.prop !== Enum.VALUE) { throw new Error(...); }
 *
 * Pattern 2 — simple strict-equality guard (reject-if-equal):
 *   if (entity.prop === Enum.VALUE) { throw new Error(...); }
 *
 * Pattern 3 — multi-neq AND guard (whitelist: must be one of several states):
 *   if (entity.prop !== Enum.A && entity.prop !== Enum.B) { throw ...; }
 *   Emits separate RawGuard per AND-branch, each carrying the full rejected set
 *   in additionalRejected so the normalizer can reconstruct the allowed set.
 *
 * Pattern 4 — null fact comparison:
 *   if (entity.fact !== null) { throw new Error(...); }
 *   The normalizer can represent the successful continuation as fact = null.
 *   An `=== null` rejection is extracted for evidence, but its successful
 *   non-null continuation is not converted into a lossy boolean fact.
 *
 * NOT SUPPORTED (safely ignored):
 *   - OR chains (||)
 *   - Negation of a complex sub-expression
 *   - Property access guards without a RHS enum/identifier/null value
 *   - Guards without a throw in the immediate if-body
 *
 * All identifiers (entity name, property, enum name) are discovered from the AST.
 */

import {
  SourceFile,
  SyntaxKind,
  IfStatement,
  BinaryExpression,
  PropertyAccessExpression,
  ThrowStatement,
  NewExpression,
  Node,
  FunctionDeclaration,
  MethodDeclaration,
} from "ts-morph";
import { RawGuard } from "../types.js";

function enclosingFunctionName(node: Node): string {
  let current: Node | undefined = node.getParent();
  while (current) {
    const kind = current.getKind();
    if (
      kind === SyntaxKind.FunctionDeclaration ||
      kind === SyntaxKind.MethodDeclaration
    ) {
      return (current as FunctionDeclaration | MethodDeclaration).getName() ?? "<anonymous>";
    }
    current = current.getParent();
  }
  return "<unknown>";
}

/** Check whether the immediate then-branch contains a throw statement */
function thenBranchThrows(stmt: IfStatement): {
  throws: boolean;
  throwClass: string | null;
} {
  const thenBranch = stmt.getThenStatement();
  // Block or single statement
  const throwStmts = thenBranch.getDescendantsOfKind(SyntaxKind.ThrowStatement);
  if (throwStmts.length === 0) return { throws: false, throwClass: null };

  const throwStmt = throwStmts[0] as ThrowStatement;
  const expr = throwStmt.getExpression();
  if (expr && expr.getKind() === SyntaxKind.NewExpression) {
    const newExpr = expr as NewExpression;
    const classExpr = newExpr.getExpression();
    if (classExpr.getKind() === SyntaxKind.Identifier) {
      return { throws: true, throwClass: classExpr.getText() };
    }
  }
  return { throws: true, throwClass: null };
}

interface ParsedComparison {
  objectName: string;
  propertyName: string;
  subject: string;
  operator: "eq" | "neq";
  enumName: string | null;
  value: string | null;
}

/** Parse `entity.prop (===|!==) Enum.VALUE`, an identifier, or null. */
function parseComparison(bin: BinaryExpression): ParsedComparison | null {
  const op = bin.getOperatorToken().getKind();
  if (
    op !== SyntaxKind.EqualsEqualsEqualsToken &&
    op !== SyntaxKind.ExclamationEqualsEqualsToken
  ) {
    return null;
  }

  const left = bin.getLeft();
  const right = bin.getRight();

  // LHS: entity.prop
  if (left.getKind() !== SyntaxKind.PropertyAccessExpression) return null;
  const leftPa = left as PropertyAccessExpression;
  if (leftPa.getExpression().getKind() !== SyntaxKind.Identifier) return null;

  const objectName = leftPa.getExpression().getText();
  const propertyName = leftPa.getName();
  const subject = `${objectName}.${propertyName}`;

  // RHS: Enum.MEMBER or plain Identifier
  let enumName: string | null = null;
  let value: string | null;

  if (right.getKind() === SyntaxKind.PropertyAccessExpression) {
    const rightPa = right as PropertyAccessExpression;
    if (rightPa.getExpression().getKind() !== SyntaxKind.Identifier) return null;
    enumName = rightPa.getExpression().getText();
    value = rightPa.getName();
  } else if (right.getKind() === SyntaxKind.Identifier) {
    value = right.getText();
  } else if (right.getKind() === SyntaxKind.NullKeyword) {
    value = null;
  } else {
    return null;
  }

  const operator: "eq" | "neq" =
    op === SyntaxKind.ExclamationEqualsEqualsToken ? "neq" : "eq";

  return { objectName, propertyName, subject, operator, enumName, value };
}

/**
 * Decompose a guard condition expression into a flat list of comparisons.
 * Handles:
 *   - simple comparison
 *   - A && B  (recursively flattened)
 * Returns null if any branch is unrecognized (safe-fail).
 */
function decomposeAnd(expr: Node): ParsedComparison[] | null {
  const kind = expr.getKind();

  if (kind === SyntaxKind.BinaryExpression) {
    const bin = expr as BinaryExpression;
    const opKind = bin.getOperatorToken().getKind();

    if (opKind === SyntaxKind.AmpersandAmpersandToken) {
      const left = decomposeAnd(bin.getLeft());
      const right = decomposeAnd(bin.getRight());
      if (left === null || right === null) return null;
      return [...left, ...right];
    }

    // Try to parse as a single comparison
    const comp = parseComparison(bin);
    return comp ? [comp] : null;
  }

  // Parenthesized expression
  if (kind === SyntaxKind.ParenthesizedExpression) {
    return decomposeAnd((expr as any).getExpression());
  }

  return null;
}

export function extractGuards(sf: SourceFile, relPath: string): RawGuard[] {
  const results: RawGuard[] = [];

  sf.getDescendantsOfKind(SyntaxKind.IfStatement).forEach((ifStmt) => {
    const { throws, throwClass } = thenBranchThrows(ifStmt);
    if (!throws) return; // Only process throwing guards

    const condition = ifStmt.getExpression();
    const comparisons = decomposeAnd(condition);

    if (comparisons === null || comparisons.length === 0) return;

    const fnName = enclosingFunctionName(ifStmt);
    const line = ifStmt.getStartLineNumber();

    // All comparisons must involve the same subject for multi-neq AND guards
    const subjects = new Set(comparisons.map((c) => c.subject));

    if (comparisons.length === 1) {
      // Simple guard
      const c = comparisons[0]!;
      results.push({
        functionName: fnName,
        objectName: c.objectName,
        subject: c.subject,
        propertyName: c.propertyName,
        operator: c.operator,
        enumName: c.enumName,
        value: c.value,
        throws: true,
        throwsClass: throwClass,
        additionalRejected: [],
        file: relPath,
        line,
      });
      return;
    }

    if (subjects.size === 1) {
      // Multi-neq AND guard on the same subject: emit one record per comparison
      // with additionalRejected carrying the rest of the rejected set
      const allValues = comparisons.map((c) => c.value);
      comparisons.forEach((c) => {
        const others = allValues.filter((v) => v !== c.value);
        results.push({
          functionName: fnName,
          objectName: c.objectName,
          subject: c.subject,
          propertyName: c.propertyName,
          operator: c.operator,
          enumName: c.enumName,
          value: c.value,
          throws: true,
          throwsClass: throwClass,
          additionalRejected: others,
          file: relPath,
          line,
        });
      });
      return;
    }

    // Mixed subjects — emit each comparison independently as a simple guard
    comparisons.forEach((c) => {
      results.push({
        functionName: fnName,
        objectName: c.objectName,
        subject: c.subject,
        propertyName: c.propertyName,
        operator: c.operator,
        enumName: c.enumName,
        value: c.value,
        throws: true,
        throwsClass: throwClass,
        additionalRejected: [],
        file: relPath,
        line,
      });
    });
  });

  return results;
}
