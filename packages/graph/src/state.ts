import type {
  ForbiddenCondition,
  GraphState,
  StateTransition,
} from "@nevergraph/schemas";

/** Return a GraphState copy with facts in stable, code-unit key order. */
export function normalizeGraphState(state: GraphState): GraphState {
  const facts = Object.fromEntries(
    Object.keys(state.facts)
      .sort(compareStrings)
      .map((key) => [key, state.facts[key]!] as const),
  ) as GraphState["facts"];

  return { state: state.state, facts };
}

/**
 * Build the canonical identity used for visited-state tracking and graph IDs.
 * Both the lifecycle state and the complete fact record participate.
 */
export function canonicalizeGraphState(state: GraphState): string {
  return JSON.stringify(normalizeGraphState(state));
}

/** Compare strings by UTF-16 code units without locale-dependent behavior. */
export function compareStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/**
 * A transition applies only when its source state matches and every source
 * fact requirement is present with the exact same value.
 */
export function isTransitionApplicable(
  currentState: GraphState,
  transition: StateTransition,
): boolean {
  if (currentState.state !== transition.from.state) return false;

  return Object.entries(transition.from.facts).every(
    ([key, value]) =>
      Object.prototype.hasOwnProperty.call(currentState.facts, key) &&
      currentState.facts[key] === value,
  );
}

/**
 * Apply `to.facts` as a patch. Unspecified historical facts are preserved;
 * supplied values, including null, overwrite the previous value.
 */
export function applyTransition(
  currentState: GraphState,
  transition: StateTransition,
): GraphState {
  if (!isTransitionApplicable(currentState, transition)) {
    throw new Error(
      `Transition ${transition.id} (${transition.action}) is not applicable to ${canonicalizeGraphState(currentState)}`,
    );
  }

  return normalizeGraphState({
    state: transition.to.state,
    facts: {
      ...currentState.facts,
      ...transition.to.facts,
    },
  });
}

/** Match the target lifecycle state and every required fact exactly. */
export function evaluateForbiddenCondition(
  state: GraphState,
  condition: ForbiddenCondition,
): boolean {
  if (state.state !== condition.targetState) return false;

  return Object.entries(condition.requiredFacts).every(
    ([key, value]) =>
      Object.prototype.hasOwnProperty.call(state.facts, key) &&
      state.facts[key] === value,
  );
}
