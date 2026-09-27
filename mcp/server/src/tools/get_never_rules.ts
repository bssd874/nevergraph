/**
 * get_never_rules.ts
 *
 * MCP tool: get_never_rules
 * Returns validated NeverRule[] from .nevergraph/rules.json.
 * Validates with Zod before returning — rejects malformed persisted data.
 */

import { readValidatedRules } from "../persistence.js";
import type { NeverRule } from "@nevergraph/schemas";

export interface GetNeverRulesInput {
  workspaceRoot: string;
}

export interface GetNeverRulesOutput {
  rules: NeverRule[];
  count: number;
}

export function getNeverRules(input: GetNeverRulesInput): GetNeverRulesOutput {
  const rules = readValidatedRules(input.workspaceRoot);
  return { rules, count: rules.length };
}
