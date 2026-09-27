import {
  GraphStateSchema,
  NeverGraphDataSchema,
  NeverRuleSchema,
  StateTransitionSchema,
  type GraphState,
  type NeverGraphData,
  type NeverGraphEdge,
  type NeverGraphNode,
  type NeverRule,
  type StateTransition,
} from "@nevergraph/schemas";
import { compareStateTransitions, searchForbiddenState } from "./search.js";
import { compareStrings } from "./state.js";
import type { SearchLimits } from "./types.js";

export interface BuildNeverGraphInput {
  initialState: GraphState;
  transitions: StateTransition[];
  rules: NeverRule[];
  limits?: SearchLimits;
}

/**
 * Build the shared-schema graph projection for one initial state and a set of
 * rules. Incomplete bounded searches map to the schema's existing `unknown`
 * reachability status; detailed limit reasons remain available from
 * searchForbiddenState().
 */
export function buildNeverGraph(input: BuildNeverGraphInput): NeverGraphData {
  const initialState = GraphStateSchema.parse(input.initialState);
  const transitions = StateTransitionSchema.array()
    .parse(input.transitions)
    .sort(compareStateTransitions);
  const rules = NeverRuleSchema.array()
    .parse(input.rules)
    .sort((left, right) => compareStrings(left.id, right.id));

  const nodes = new Map<string, NeverGraphNode>();
  const edges = new Map<string, NeverGraphEdge>();
  const reachabilityStatus: NeverGraphData["reachabilityStatus"] = {};

  for (const rule of rules) {
    const result = searchForbiddenState({
      initialState,
      transitions,
      forbiddenCondition: rule.forbiddenCondition,
      ...(input.limits === undefined ? {} : { limits: input.limits }),
    });

    reachabilityStatus[rule.id] =
      result.status === "found"
        ? "reachable"
        : result.status === "unreachable"
          ? "unreachable"
          : "unknown";

    for (const node of result.graph.nodes) {
      const existing = nodes.get(node.id);
      if (!existing || (node.forbidden === true && existing.forbidden !== true)) {
        nodes.set(node.id, node);
      }
    }
    for (const edge of result.graph.edges) edges.set(edge.id, edge);
  }

  return NeverGraphDataSchema.parse({
    nodes: [...nodes.values()].sort((left, right) => compareStrings(left.id, right.id)),
    edges: [...edges.values()].sort((left, right) => compareStrings(left.id, right.id)),
    forbiddenConditions: rules,
    reachabilityStatus,
  });
}
