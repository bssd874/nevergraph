/**
 * extractors/assignments.ts
 *
 * Extracts two categories of direct property assignments:
 *
 * 1. STATUS ASSIGNMENTS — `entity.statusProp = Enum.MEMBER`
 *    Recognized pattern: ExpressionStatement → BinaryExpression where
 *      left  = PropertyAccessExpression (object.property)
 *      right = PropertyAccessExpression (Enum.MEMBER)
 *    The right-hand side must be a qualified name (two identifiers joined by dot)
 *    to distinguish enum access from arbitrary expressions.
 *
 * 2. FACT ASSIGNMENTS — `entity.someProp = <non-enum expression | null>`
 *    Same structural pattern but RHS is not an enum-style qualified name.
 *    - null literal  → value: null
 *    - anything else (new Date(), true, false, literal) → value: true (present/non-null)
 *
 * Both extractors discover object names, property names, and enum names entirely
 * from the AST — no Mercury-specific identifiers are hard-coded.
 */

import {
  SourceFile,
  SyntaxKind,
  BinaryExpression,
  PropertyAccessExpression,
  FunctionDeclaration,
  MethodDeclaration,
  ArrowFunction,
  Node,
} from "ts-morph";
import { RawStatusAssignment, RawFactAssignment } from "../types.js";

/** Walk up the ancestor chain to find the nearest enclosing function name */
function enclosingFunctionName(node: Node): string {
  let current: Node | undefined = node.getParent();
  while (current) {
    if (
      current.getKind() === SyntaxKind.FunctionDeclaration ||
      current.getKind() === SyntaxKind.MethodDeclaration
    ) {
      const fn = current as FunctionDeclaration | MethodDeclaration;
      return fn.getName() ?? "<anonymous>";
    }
    if (current.getKind() === SyntaxKind.ArrowFunction) {
      // Arrow function: check the variable it is assigned to
      const arrow = current as ArrowFunction;
      const varDecl = arrow.getParent();
      if (varDecl && varDecl.getKind() === SyntaxKind.VariableDeclaration) {
        const nameNode = (varDecl as any).getNameNode?.();
        if (nameNode) return nameNode.getText();
      }
      return "<arrow>";
    }
    current = current.getParent();
  }
  return "<unknown>";
}

/** Return true when a PropertyAccessExpression looks like an enum access: Identifier.Identifier */
function isEnumAccess(expr: Node): boolean {
  if (expr.getKind() !== SyntaxKind.PropertyAccessExpression) return false;
  const pa = expr as PropertyAccessExpression;
  return pa.getExpression().getKind() === SyntaxKind.Identifier;
}

export function extractStatusAssignments(
  sf: SourceFile,
  relPath: string,
): RawStatusAssignment[] {
  const results: RawStatusAssignment[] = [];

  sf.getDescendantsOfKind(SyntaxKind.BinaryExpression).forEach((bin) => {
    // Must be assignment operator
    if (bin.getOperatorToken().getKind() !== SyntaxKind.EqualsToken) return;

    const left = bin.getLeft();
    const right = bin.getRight();

    // LHS must be a property access
    if (left.getKind() !== SyntaxKind.PropertyAccessExpression) return;

    // RHS must be an enum-style access (Enum.MEMBER)
    if (!isEnumAccess(right)) return;

    const leftPa = left as PropertyAccessExpression;
    const rightPa = right as PropertyAccessExpression;

    // Skip if the LHS object is not a simple identifier (e.g. this.x.y)
    if (leftPa.getExpression().getKind() !== SyntaxKind.Identifier) return;

    results.push({
      functionName: enclosingFunctionName(bin),
      objectName: leftPa.getExpression().getText(),
      propertyName: leftPa.getName(),
      enumName: rightPa.getExpression().getText(),
      enumMember: rightPa.getName(),
      file: relPath,
      line: bin.getStartLineNumber(),
    });
  });

  return results;
}

export function extractFactAssignments(
  sf: SourceFile,
  relPath: string,
): RawFactAssignment[] {
  const results: RawFactAssignment[] = [];

  sf.getDescendantsOfKind(SyntaxKind.BinaryExpression).forEach((bin) => {
    if (bin.getOperatorToken().getKind() !== SyntaxKind.EqualsToken) return;

    const left = bin.getLeft();
    const right = bin.getRight();

    if (left.getKind() !== SyntaxKind.PropertyAccessExpression) return;

    // Skip enum-style RHS — those are handled by extractStatusAssignments
    if (isEnumAccess(right)) return;

    const leftPa = left as PropertyAccessExpression;

    // LHS object must be a simple identifier
    if (leftPa.getExpression().getKind() !== SyntaxKind.Identifier) return;

    const isNull = right.getKind() === SyntaxKind.NullKeyword;

    results.push({
      functionName: enclosingFunctionName(bin),
      objectName: leftPa.getExpression().getText(),
      propertyName: leftPa.getName(),
      value: isNull ? null : true,
      file: relPath,
      line: bin.getStartLineNumber(),
    });
  });

  return results;
}
