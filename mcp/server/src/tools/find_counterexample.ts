/**
 * find_counterexample.ts
 *
 * MCP tool: find_counterexample
 *
 * Delegates entirely to @nevergraph/graph searchForbiddenState.
 * Does NOT reimplement BFS or any reachability logic.
 *
 * Returns a deterministic search result. Bob must not claim reachability
 * or unreachability without calling this tool first.
 */

import {
  searchForbiddenState,
  DEFAULT_SEARCH_LIMITS,
  type SearchForbiddenStateInput,
  type SearchResult,
} from "@nevergraph/graph";
import {
  ForbiddenConditionSchema,
  GraphStateSchema,
  StateTransitionSchema,
  type ForbiddenCondition,
  type GraphState,
  type StateTransition,
} from "@nevergraph/schemas";

export interface FindCounterexampleInput {
  initialState: GraphState;
  transitions: StateTransition[];
  forbiddenCondition: ForbiddenCondition;
  limits?: {
    maxDepth?: number;
    maxVisitedStates?: number;
  };
}

export interface FindCounterexampleOutput {
  status: "found" | "unreachable" | "limit_reached";
  depth: number | null;
  pathLength: number;
  exploredStateCount: number;
  path: StateTransition[];
  limits: {
    maxDepth: number;
    maxVisitedStates: number;
  };
}

/**
 * Validate inputs and delegate BFS search to @nevergraph/graph.
 * This handler adds NO search logic — it is a thin validated wrapper.
 */
export function findCounterexample(input: FindCounterexampleInput): FindCounterexampleOutput {
  // Validate all inputs against shared schemas before passing to the engine
  const initialState = GraphStateSchema.parse(input.initialState);
  const transitions = StateTransitionSchema.array().parse(input.transitions);
  const forbiddenCondition = ForbiddenConditionSchema.parse(input.forbiddenCondition);

  const searchInput: SearchForbiddenStateInput = {
    initialState,
    transitions,
    forbiddenCondition,
  };

  if (input.limits !== undefined) {
    searchInput.limits = input.limits;
  }

  const result: SearchResult = searchForbiddenState(searchInput);

  return {
    status: result.status,
    depth: result.depth,
    pathLength: result.path.length,
    exploredStateCount: result.exploredStateCount,
    path: result.path,
    limits: result.limits,
  };
}
