/** @nevergraph/graph — deterministic, context-aware bounded reachability. */

export {
  applyTransition,
  canonicalizeGraphState,
  evaluateForbiddenCondition,
  isTransitionApplicable,
  normalizeGraphState,
} from "./state.js";

export {
  DEFAULT_SEARCH_LIMITS,
  compareStateTransitions,
  searchForbiddenState,
} from "./search.js";

export { buildNeverGraph, type BuildNeverGraphInput } from "./builder.js";

export type {
  ExploredGraph,
  FoundSearchResult,
  LimitReachedSearchResult,
  ResolvedSearchLimits,
  SearchForbiddenStateInput,
  SearchLimitReason,
  SearchLimits,
  SearchResult,
  SearchStatus,
  UnreachableSearchResult,
} from "./types.js";
