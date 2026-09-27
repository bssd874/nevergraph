/**
 * get_transitions.ts
 *
 * MCP tool: get_transitions
 * Returns validated StateTransition[] from .nevergraph/transitions.json.
 * Validates with Zod before returning — rejects malformed persisted data.
 */

import { readTransitions } from "../persistence.js";
import type { StateTransition } from "@nevergraph/schemas";

export interface GetTransitionsInput {
  workspaceRoot: string;
}

export interface GetTransitionsOutput {
  transitions: StateTransition[];
  count: number;
}

export function getTransitions(input: GetTransitionsInput): GetTransitionsOutput {
  const transitions = readTransitions(input.workspaceRoot);
  return { transitions, count: transitions.length };
}
