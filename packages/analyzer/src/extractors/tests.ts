/**
 * extractors/tests.ts
 *
 * Extracts negative test evidence from Vitest test source files.
 *
 * SUPPORTED GRAMMAR
 * =================
 *
 * Detects it() / test() blocks where the body contains:
 *   expect(() => someFunction(arg)).toThrow(...)
 *
 * From this pattern extracts:
 *   - suiteName: the enclosing describe() block's label string
 *   - testName: the it() / test() label string
 *   - testedOperation: the function called inside the arrow fn passed to expect()
 *   - expectsThrow: true
 *   - referencedStates: any Enum.MEMBER or plain uppercase IDENTIFIER referenced in the test body
 *
 * NOT SUPPORTED (safely ignored):
 *   - expect(fn()).toThrow() where fn is not directly called (non-arrow expect wrappers)
 *   - Complex multi-statement expect wrappers
 *   - Non-throw assertions
 */

import {
  SourceFile,
  SyntaxKind,
  CallExpression,
  ArrowFunction,
  Node,
  StringLiteral,
  NoSubstitutionTemplateLiteral,
} from "ts-morph";
import { RawNegativeTest } from "../types.js";

/** Extract string value from a string literal or template literal node */
function getStringValue(node: Node): string | null {
  const kind = node.getKind();
  if (kind === SyntaxKind.StringLiteral) {
    return (node as StringLiteral).getLiteralValue();
  }
  if (kind === SyntaxKind.NoSubstitutionTemplateLiteral) {
    return (node as NoSubstitutionTemplateLiteral).getLiteralValue();
  }
  return null;
}

/**
 * Collect enum-style member references (Identifier.IDENTIFIER or uppercase IDENTIFIER)
 * from a node's text, dynamically. Does not hard-code any names.
 */
function collectStateReferences(node: Node): string[] {
  const refs = new Set<string>();

  // Walk property access expressions for Enum.MEMBER patterns
  node.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression).forEach((pa) => {
    const memberName = pa.getName();
    // Uppercase members are likely enum values
    if (/^[A-Z][A-Z0-9_]*$/.test(memberName)) {
      refs.add(memberName);
    }
  });

  return [...refs].sort();
}

/** Find the name of a function directly called inside an arrow function body */
function extractDirectCall(arrow: ArrowFunction): string | null {
  // arrow body is a call expression: () => fn(arg) or () => { fn(arg); }
  const body = arrow.getBody();
  let callExpr: CallExpression | null = null;

  if (body.getKind() === SyntaxKind.CallExpression) {
    callExpr = body as CallExpression;
  } else {
    // Block body — find a single expression statement with a call
    const calls = body.getDescendantsOfKind(SyntaxKind.CallExpression);
    if (calls.length === 1) {
      callExpr = calls[0] ?? null;
    }
  }

  if (!callExpr) return null;

  const fn = callExpr.getExpression();
  if (fn.getKind() === SyntaxKind.Identifier) {
    return fn.getText();
  }
  return null;
}

/**
 * Walk describe() blocks to find their label, enabling suite name lookup for
 * any descendant it() / test() call.
 */
interface DescribeBlock {
  name: string;
  node: CallExpression;
}

function findDescribeBlocks(sf: SourceFile): DescribeBlock[] {
  const blocks: DescribeBlock[] = [];
  sf.getDescendantsOfKind(SyntaxKind.CallExpression).forEach((call) => {
    const expr = call.getExpression();
    if (expr.getKind() !== SyntaxKind.Identifier) return;
    const name = expr.getText();
    if (name !== "describe") return;
    const args = call.getArguments();
    if (args.length < 1) return;
    const label = getStringValue(args[0]!);
    if (label !== null) blocks.push({ name: label, node: call });
  });
  return blocks;
}

/** Find the innermost describe block containing a given node */
function findSuiteName(blocks: DescribeBlock[], target: Node): string {
  let closest: DescribeBlock | null = null;
  let closestStart = -1;
  for (const block of blocks) {
    const start = block.node.getStart();
    const end = block.node.getEnd();
    const targetPos = target.getStart();
    if (targetPos >= start && targetPos <= end && start > closestStart) {
      closest = block;
      closestStart = start;
    }
  }
  return closest?.name ?? "";
}

export function extractNegativeTests(
  sf: SourceFile,
  relPath: string,
): RawNegativeTest[] {
  const results: RawNegativeTest[] = [];
  const describeBlocks = findDescribeBlocks(sf);

  sf.getDescendantsOfKind(SyntaxKind.CallExpression).forEach((call) => {
    const expr = call.getExpression();
    if (expr.getKind() !== SyntaxKind.Identifier) return;
    const calleeName = expr.getText();
    if (calleeName !== "it" && calleeName !== "test") return;

    const args = call.getArguments();
    if (args.length < 2) return;
    const labelNode = args[0];
    if (!labelNode) return;
    const testName = getStringValue(labelNode);
    if (testName === null) return;

    const bodyArg = args[1];
    if (!bodyArg) return;

    // Check if body contains expect(() => fn()).toThrow()
    const expectCalls = bodyArg.getDescendantsOfKind(SyntaxKind.CallExpression).filter((c) => {
      // Look for .toThrow() method calls
      const cExpr = c.getExpression();
      if (cExpr.getKind() !== SyntaxKind.PropertyAccessExpression) return false;
      const pa = cExpr as any;
      return pa.getName() === "toThrow";
    });

    if (expectCalls.length === 0) return;

    // Find the expect() call wrapping an arrow function
    let testedOperation: string | null = null;
    const expectCallsAll = bodyArg.getDescendantsOfKind(SyntaxKind.CallExpression).filter((c) => {
      const cExpr = c.getExpression();
      return cExpr.getKind() === SyntaxKind.Identifier && cExpr.getText() === "expect";
    });

    for (const ec of expectCallsAll) {
      const ecArgs = ec.getArguments();
      if (ecArgs.length < 1) continue;
      const firstArg = ecArgs[0];
      if (!firstArg) continue;
      if (firstArg.getKind() === SyntaxKind.ArrowFunction) {
        const op = extractDirectCall(firstArg as ArrowFunction);
        if (op) {
          testedOperation = op;
          break;
        }
      }
    }

    const suiteName = findSuiteName(describeBlocks, call);
    const referencedStates = collectStateReferences(bodyArg);

    results.push({
      suiteName,
      testName,
      testedOperation,
      expectsThrow: true,
      referencedStates,
      file: relPath,
      line: call.getStartLineNumber(),
    });
  });

  return results;
}
