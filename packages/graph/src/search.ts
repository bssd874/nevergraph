import {
  ForbiddenConditionSchema,
  GraphStateSchema,
  StateTransitionSchema,
  type GraphState,
  type NeverGraphEdge,
  type NeverGraphNode,
  type StateTransition,
} from "@nevergraph/schemas";
import {
  applyTransition,
  canonicalizeGraphState,
  compareStrings,
  evaluateForbiddenCondition,
  isTransitionApplicable,
  normalizeGraphState,
} from "./state.js";
import type {
  ExploredGraph,
  ResolvedSearchLimits,
  SearchForbiddenStateInput,
  SearchLimitReason,
  SearchResult,
} from "./types.js";

export const DEFAULT_SEARCH_LIMITS: Readonly<ResolvedSearchLimits> = Object.freeze({
  maxDepth: 10,
  maxVisitedStates: 10_000,
});

interface QueueEntry {
  state: GraphState;
  depth: number;
  path: StateTransition[];
}

function resolveLimits(input: SearchForbiddenStateInput["limits"]): ResolvedSearchLimits {
  const limits = {
    maxDepth: input?.maxDepth ?? DEFAULT_SEARCH_LIMITS.maxDepth,
    maxVisitedStates:
      input?.maxVisitedStates ?? DEFAULT_SEARCH_LIMITS.maxVisitedStates,
  };

  if (!Number.isInteger(limits.maxDepth) || limits.maxDepth < 0) {
    throw new RangeError("maxDepth must be a non-negative integer");
  }
  if (!Number.isInteger(limits.maxVisitedStates) || limits.maxVisitedStates < 1) {
    throw new RangeError("maxVisitedStates must be a positive integer");
  }

  return limits;
}

/** Stable transition order: action, canonical from, canonical to, id, file, line. */
export function compareStateTransitions(
  left: StateTransition,
  right: StateTransition,
): number {
  const stringFields: Array<[string, string]> = [
    [left.action, right.action],
    [canonicalizeGraphState(left.from), canonicalizeGraphState(right.from)],
    [canonicalizeGraphState(left.to), canonicalizeGraphState(right.to)],
    [left.id, right.id],
    [left.file, right.file],
  ];

  for (const [leftField, rightField] of stringFields) {
    const comparison = compareStrings(leftField, rightField);
    if (comparison !== 0) return comparison;
  }

  return left.line - right.line;
}

function graphNode(state: GraphState, forbidden: boolean): NeverGraphNode {
  const node: NeverGraphNode = {
    id: canonicalizeGraphState(state),
    label: state.state,
  };

  if (forbidden) node.forbidden = true;
  return node;
}

function graphEdge(
  source: GraphState,
  target: GraphState,
  transition: StateTransition,
): NeverGraphEdge {
  const sourceId = canonicalizeGraphState(source);
  const targetId = canonicalizeGraphState(target);

  return {
    id: JSON.stringify([
      "edge",
      sourceId,
      targetId,
      transition.action,
      transition.id,
      transition.file,
      transition.line,
    ]),
    source: sourceId,
    target: targetId,
    action: transition.action,
  };
}

function snapshotGraph(
  nodes: Map<string, NeverGraphNode>,
  edges: Map<string, NeverGraphEdge>,
): ExploredGraph {
  return {
    nodes: [...nodes.values()].sort((left, right) => compareStrings(left.id, right.id)),
    edges: [...edges.values()].sort((left, right) => {
      const sourceComparison = compareStrings(left.source, right.source);
      if (sourceComparison !== 0) return sourceComparison;
      const targetComparison = compareStrings(left.target, right.target);
      if (targetComparison !== 0) return targetComparison;
      const actionComparison = compareStrings(left.action, right.action);
      if (actionComparison !== 0) return actionComparison;
      return compareStrings(left.id, right.id);
    }),
  };
}

/**
 * Deterministically search for the shortest path to a forbidden GraphState.
 * Inputs are validated against the shared schemas before exploration begins.
 */
export function searchForbiddenState(input: SearchForbiddenStateInput): SearchResult {
  const initialState = normalizeGraphState(GraphStateSchema.parse(input.initialState));
  const transitions = StateTransitionSchema.array()
    .parse(input.transitions)
    .sort(compareStateTransitions);
  const forbiddenCondition = ForbiddenConditionSchema.parse(input.forbiddenCondition);
  const limits = resolveLimits(input.limits);

  const initialKey = canonicalizeGraphState(initialState);
  const initialIsForbidden = evaluateForbiddenCondition(initialState, forbiddenCondition);
  const nodes = new Map<string, NeverGraphNode>([
    [initialKey, graphNode(initialState, initialIsForbidden)],
  ]);
  const edges = new Map<string, NeverGraphEdge>();
  const visited = new Set<string>([initialKey]);
  const queue: QueueEntry[] = [{ state: initialState, depth: 0, path: [] }];

  const commonResult = () => ({
    initialState,
    exploredStateCount: visited.size,
    limits,
    graph: snapshotGraph(nodes, edges),
  });

  if (initialIsForbidden) {
    return {
      status: "found",
      ...commonResult(),
      finalState: initialState,
      path: [],
      depth: 0,
    };
  }

  let queueIndex = 0;
  while (queueIndex < queue.length) {
    const current = queue[queueIndex++]!;

    for (const transition of transitions) {
      if (!isTransitionApplicable(current.state, transition)) continue;

      const nextState = applyTransition(current.state, transition);
      const nextKey = canonicalizeGraphState(nextState);

      if (current.depth >= limits.maxDepth) {
        if (!visited.has(nextKey)) {
          return limitResult("maxDepth", commonResult);
        }

        const edge = graphEdge(current.state, nextState, transition);
        edges.set(edge.id, edge);
        continue;
      }

      if (visited.has(nextKey)) {
        const edge = graphEdge(current.state, nextState, transition);
        edges.set(edge.id, edge);
        continue;
      }

      if (visited.size >= limits.maxVisitedStates) {
        return limitResult("maxVisitedStates", commonResult);
      }

      visited.add(nextKey);
      const isForbidden = evaluateForbiddenCondition(nextState, forbiddenCondition);
      nodes.set(nextKey, graphNode(nextState, isForbidden));
      const edge = graphEdge(current.state, nextState, transition);
      edges.set(edge.id, edge);

      const path = [...current.path, transition];
      const depth = current.depth + 1;

      if (isForbidden) {
        return {
          status: "found",
          ...commonResult(),
          finalState: nextState,
          path,
          depth,
        };
      }

      queue.push({ state: nextState, depth, path });
    }
  }

  return {
    status: "unreachable",
    ...commonResult(),
    finalState: null,
    path: [],
    depth: null,
  };
}

function limitResult(
  limitReason: SearchLimitReason,
  commonResult: () => {
    initialState: GraphState;
    exploredStateCount: number;
    limits: ResolvedSearchLimits;
    graph: ExploredGraph;
  },
): SearchResult {
  return {
    status: "limit_reached",
    ...commonResult(),
    limitReason,
    finalState: null,
    path: [],
    depth: null,
  };
}
