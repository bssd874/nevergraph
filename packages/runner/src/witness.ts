import {
  GraphStateSchema,
  StateTransitionSchema,
  WitnessSchema,
  type GraphState,
  type StateTransition,
  type Witness,
  type WitnessStep,
} from "@nevergraph/schemas";
import type { SearchResult } from "@nevergraph/graph";
import { validateArtifactIdentifier } from "./artifacts.js";

export interface CreateWitnessInput {
  identifier: string;
  searchResult: SearchResult;
}

/** Convert an already-found Phase 3 path into a validated shared Witness. */
export function createWitness(input: CreateWitnessInput): Witness {
  const identifier = validateArtifactIdentifier(input.identifier);
  const result = input.searchResult;

  if (result.status !== "found") {
    throw new Error("a witness can only be created from a found search result");
  }
  if (result.path.length === 0 || result.depth === 0) {
    throw new Error("the shared Witness schema cannot represent an empty transition path");
  }
  if (result.depth !== result.path.length) {
    throw new Error("found result depth must equal its transition path length");
  }

  let currentState = GraphStateSchema.parse(result.initialState);
  const transitions = StateTransitionSchema.array().parse(result.path);
  const steps: WitnessStep[] = [];

  for (const transition of transitions) {
    const fromState = GraphStateSchema.parse(currentState);
    const toState = replayTransition(fromState, transition);
    steps.push({ action: transition.action, fromState, toState });
    currentState = toState;
  }

  assertSameState(currentState, GraphStateSchema.parse(result.finalState));

  return WitnessSchema.parse({
    ruleId: identifier,
    steps,
    length: steps.length,
    isForbidden: true,
  });
}

function assertSameState(actual: GraphState, expected: GraphState): void {
  if (canonicalState(actual) !== canonicalState(expected)) {
    throw new Error("replayed witness final state does not match the found result");
  }
}

function replayTransition(
  currentState: GraphState,
  transition: StateTransition,
): GraphState {
  if (currentState.state !== transition.from.state) {
    throw new Error(`transition ${transition.id} has an inconsistent source state`);
  }
  for (const [key, value] of Object.entries(transition.from.facts)) {
    if (
      !Object.prototype.hasOwnProperty.call(currentState.facts, key) ||
      currentState.facts[key] !== value
    ) {
      throw new Error(`transition ${transition.id} has inconsistent source facts`);
    }
  }

  return GraphStateSchema.parse({
    state: transition.to.state,
    facts: {
      ...currentState.facts,
      ...transition.to.facts,
    },
  });
}

function canonicalState(state: GraphState): string {
  const facts = Object.fromEntries(
    Object.keys(state.facts)
      .sort(compareStrings)
      .map((key) => [key, state.facts[key]!] as const),
  );
  return JSON.stringify({ state: state.state, facts });
}

function compareStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
