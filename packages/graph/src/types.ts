import type {
  ForbiddenCondition,
  GraphState,
  NeverGraphEdge,
  NeverGraphNode,
  StateTransition,
} from "@nevergraph/schemas";

export interface SearchLimits {
  /** Maximum number of transitions in any explored path. */
  maxDepth?: number;
  /** Maximum number of unique context-aware states admitted to the search. */
  maxVisitedStates?: number;
}

export interface ResolvedSearchLimits {
  maxDepth: number;
  maxVisitedStates: number;
}

export interface SearchForbiddenStateInput {
  initialState: GraphState;
  transitions: StateTransition[];
  forbiddenCondition: ForbiddenCondition;
  limits?: SearchLimits;
}

export interface ExploredGraph {
  nodes: NeverGraphNode[];
  edges: NeverGraphEdge[];
}

export type SearchStatus = "found" | "unreachable" | "limit_reached";
export type SearchLimitReason = "maxDepth" | "maxVisitedStates";

interface SearchResultBase {
  initialState: GraphState;
  /** Number of unique context-aware states admitted to the search. */
  exploredStateCount: number;
  limits: ResolvedSearchLimits;
  graph: ExploredGraph;
}

export interface FoundSearchResult extends SearchResultBase {
  status: "found";
  finalState: GraphState;
  path: StateTransition[];
  depth: number;
}

export interface UnreachableSearchResult extends SearchResultBase {
  status: "unreachable";
  finalState: null;
  path: [];
  depth: null;
}

export interface LimitReachedSearchResult extends SearchResultBase {
  status: "limit_reached";
  limitReason: SearchLimitReason;
  finalState: null;
  path: [];
  depth: null;
}

export type SearchResult =
  | FoundSearchResult
  | UnreachableSearchResult
  | LimitReachedSearchResult;
