/**
 * verify_rule.ts
 *
 * MCP tool: verify_rule
 *
 * Runs deterministic graph-level reachability verification for a given rule.
 * Delegates to @nevergraph/graph searchForbiddenState via findCounterexample.
 * Does NOT invent reachability results.
 *
 * If required context (transitions, initial state) cannot be determined,
 * returns an explicit "context_missing" error rather than fabricating output.
 */

import { readTransitions, readValidatedRules } from "../persistence.js";
import { findCounterexample, type FindCounterexampleInput } from "./find_counterexample.js";
import type { GraphState } from "@nevergraph/schemas";

export interface VerifyRuleInput {
  ruleId: string;
  initialState: GraphState;
  workspaceRoot: string;
  limits?: {
    maxDepth?: number;
    maxVisitedStates?: number;
  };
}

export interface VerifyRuleOutput {
  ruleId: string;
  status: "unreachable" | "reachable" | "limit_reached" | "rule_not_found" | "context_missing";
  depth: number | null;
  exploredStateCount: number;
  message: string;
}

export function verifyRule(input: VerifyRuleInput): VerifyRuleOutput {
  const rules = readValidatedRules(input.workspaceRoot);
  const rule = rules.find((r) => r.id === input.ruleId);

  if (!rule) {
    return {
      ruleId: input.ruleId,
      status: "rule_not_found",
      depth: null,
      exploredStateCount: 0,
      message: `Rule "${input.ruleId}" not found in rules.json`,
    };
  }

  const transitions = readTransitions(input.workspaceRoot);

  if (transitions.length === 0) {
    return {
      ruleId: input.ruleId,
      status: "context_missing",
      depth: null,
      exploredStateCount: 0,
      message: "No transitions available. Run scan_repository first.",
    };
  }

  const ceInput: FindCounterexampleInput = {
    initialState: input.initialState,
    transitions,
    forbiddenCondition: rule.forbiddenCondition,
  };
  if (input.limits !== undefined) ceInput.limits = input.limits;
  const result = findCounterexample(ceInput);

  const statusMap = {
    found: "reachable" as const,
    unreachable: "unreachable" as const,
    limit_reached: "limit_reached" as const,
  };

  return {
    ruleId: input.ruleId,
    status: statusMap[result.status],
    depth: result.depth,
    exploredStateCount: result.exploredStateCount,
    message: result.status === "found"
      ? `Violation found at depth ${result.depth}`
      : result.status === "unreachable"
        ? `Rule "${input.ruleId}" is unreachable from the given initial state`
        : `Search stopped at limit (explored ${result.exploredStateCount} states)`,
  };
}
