import { describe, expect, it } from "vitest";
import {
  NeverGraphDataSchema,
  type GraphState,
  type StateTransition,
} from "@nevergraph/schemas";
import {
  applyTransition,
  buildNeverGraph,
  canonicalizeGraphState,
  evaluateForbiddenCondition,
  isTransitionApplicable,
  searchForbiddenState,
} from "../index.js";

function transition(
  id: string,
  action: string,
  fromState: string,
  toState: string,
  fromFacts: GraphState["facts"] = {},
  toFacts: GraphState["facts"] = {},
): StateTransition {
  return {
    id,
    action,
    from: { state: fromState, facts: fromFacts },
    to: { state: toState, facts: toFacts },
    file: "fixtures/workflow.ts",
    line: 1,
    guards: [],
  };
}

describe("canonical GraphState identity", () => {
  it("is independent of fact key insertion order", () => {
    const first: GraphState = {
      state: "READY",
      facts: { marked: true, attempts: 2 },
    };
    const second: GraphState = {
      state: "READY",
      facts: { attempts: 2, marked: true },
    };

    expect(canonicalizeGraphState(first)).toBe(canonicalizeGraphState(second));
    expect(canonicalizeGraphState(first)).toBe(
      '{"state":"READY","facts":{"attempts":2,"marked":true}}',
    );
  });

  it("distinguishes equal lifecycle states with different facts", () => {
    const clear = canonicalizeGraphState({ state: "READY", facts: { marked: false } });
    const marked = canonicalizeGraphState({ state: "READY", facts: { marked: true } });

    expect(clear).not.toBe(marked);
  });
});

describe("transition applicability and patch application", () => {
  it("preserves unspecified historical facts", () => {
    const current: GraphState = {
      state: "MARKED",
      facts: { entered: true, marked: true },
    };
    const archive = transition(
      "tr-archive",
      "archive",
      "MARKED",
      "ARCHIVED",
      {},
      { archived: true },
    );

    expect(applyTransition(current, archive)).toEqual({
      state: "ARCHIVED",
      facts: { archived: true, entered: true, marked: true },
    });
  });

  it("overwrites facts that are explicitly updated", () => {
    const current: GraphState = { state: "READY", facts: { attempts: 2 } };
    const reset = transition(
      "tr-reset",
      "reset",
      "READY",
      "READY",
      {},
      { attempts: 0 },
    );

    expect(applyTransition(current, reset).facts).toEqual({ attempts: 0 });
  });

  it("preserves explicit null as an overwriting value", () => {
    const current: GraphState = { state: "READY", facts: { owner: "operator" } };
    const clearOwner = transition(
      "tr-clear",
      "clearOwner",
      "READY",
      "READY",
      {},
      { owner: null },
    );

    expect(applyTransition(current, clearOwner).facts).toEqual({ owner: null });
  });

  it("rejects a from.state mismatch", () => {
    const activate = transition("tr-activate", "activate", "IDLE", "ACTIVE");

    expect(
      isTransitionApplicable({ state: "PAUSED", facts: {} }, activate),
    ).toBe(false);
  });

  it("rejects a missing or mismatched from.facts requirement", () => {
    const publish = transition(
      "tr-publish",
      "publish",
      "READY",
      "PUBLISHED",
      { reviewed: true },
    );

    expect(
      isTransitionApplicable({ state: "READY", facts: {} }, publish),
    ).toBe(false);
    expect(
      isTransitionApplicable(
        { state: "READY", facts: { reviewed: false } },
        publish,
      ),
    ).toBe(false);
  });

  it("allows any fact context when from.facts is empty and state matches", () => {
    const advance = transition("tr-advance", "advance", "READY", "DONE");

    expect(
      isTransitionApplicable(
        { state: "READY", facts: { reviewed: true, attempts: 3 } },
        advance,
      ),
    ).toBe(true);
  });
});

describe("ForbiddenCondition evaluation", () => {
  const condition = {
    targetState: "PUBLISHED",
    requiredFacts: { marked: true, channel: "external" },
  };

  it("succeeds when all required facts match exactly", () => {
    expect(
      evaluateForbiddenCondition(
        { state: "PUBLISHED", facts: { marked: true, channel: "external" } },
        condition,
      ),
    ).toBe(true);
  });

  it("ignores irrelevant extra facts", () => {
    expect(
      evaluateForbiddenCondition(
        {
          state: "PUBLISHED",
          facts: { marked: true, channel: "external", attempts: 3 },
        },
        condition,
      ),
    ).toBe(true);
  });

  it("rejects a missing required fact", () => {
    expect(
      evaluateForbiddenCondition(
        { state: "PUBLISHED", facts: { marked: true } },
        condition,
      ),
    ).toBe(false);
  });

  it("rejects the wrong target lifecycle state", () => {
    expect(
      evaluateForbiddenCondition(
        { state: "DRAFT", facts: { marked: true, channel: "external" } },
        condition,
      ),
    ).toBe(false);
  });
});

describe("bounded deterministic BFS", () => {
  it("finds a one-step violation", () => {
    const result = searchForbiddenState({
      initialState: { state: "DRAFT", facts: {} },
      transitions: [
        transition("tr-publish", "publish", "DRAFT", "PUBLISHED", {}, { public: true }),
      ],
      forbiddenCondition: {
        targetState: "PUBLISHED",
        requiredFacts: { public: true },
      },
    });

    expect(result.status).toBe("found");
    if (result.status !== "found") return;
    expect(result.depth).toBe(1);
    expect(result.path.map((step) => step.action)).toEqual(["publish"]);
    expect(result.finalState).toEqual({
      state: "PUBLISHED",
      facts: { public: true },
    });
  });

  it("reports a forbidden initial state at depth zero", () => {
    const result = searchForbiddenState({
      initialState: { state: "LOCKED", facts: { permanent: true } },
      transitions: [],
      forbiddenCondition: {
        targetState: "LOCKED",
        requiredFacts: { permanent: true },
      },
    });

    expect(result.status).toBe("found");
    if (result.status !== "found") return;
    expect(result.depth).toBe(0);
    expect(result.path).toEqual([]);
    expect(result.exploredStateCount).toBe(1);
  });

  it("finds the shortest path among longer alternatives", () => {
    const result = searchForbiddenState({
      initialState: { state: "START", facts: {} },
      transitions: [
        transition("tr-long-1", "aLongStart", "START", "MIDDLE"),
        transition("tr-long-2", "finishLong", "MIDDLE", "FORBIDDEN"),
        transition("tr-direct", "zDirect", "START", "FORBIDDEN"),
      ],
      forbiddenCondition: { targetState: "FORBIDDEN", requiredFacts: {} },
    });

    expect(result.status).toBe("found");
    if (result.status !== "found") return;
    expect(result.depth).toBe(1);
    expect(result.path.map((step) => step.action)).toEqual(["zDirect"]);
  });

  it("avoids cycles and fully exhausts a finite reachable graph", () => {
    const result = searchForbiddenState({
      initialState: { state: "A", facts: {} },
      transitions: [
        transition("tr-ab", "advance", "A", "B"),
        transition("tr-ba", "return", "B", "A"),
      ],
      forbiddenCondition: { targetState: "C", requiredFacts: {} },
    });

    expect(result.status).toBe("unreachable");
    expect(result.exploredStateCount).toBe(2);
    expect(result.graph.nodes).toHaveLength(2);
    expect(result.graph.edges).toHaveLength(2);
  });

  it("uses fact context to revisit the same lifecycle state", () => {
    const result = searchForbiddenState({
      initialState: { state: "ACTIVE", facts: {} },
      transitions: [
        transition("tr-mark", "mark", "ACTIVE", "MARKED", {}, { marked: true }),
        transition("tr-archive", "archive", "MARKED", "ARCHIVED"),
        transition("tr-reopen", "reopen", "ARCHIVED", "ACTIVE"),
        transition("tr-publish", "publish", "ACTIVE", "PUBLISHED"),
      ],
      forbiddenCondition: {
        targetState: "PUBLISHED",
        requiredFacts: { marked: true },
      },
    });

    expect(result.status).toBe("found");
    if (result.status !== "found") return;
    expect(result.path.map((step) => step.action)).toEqual([
      "mark",
      "archive",
      "reopen",
      "publish",
    ]);
    expect(result.finalState.facts["marked"]).toBe(true);

    const activeNodes = result.graph.nodes.filter((node) => node.label === "ACTIVE");
    expect(activeNodes).toHaveLength(2);
    expect(activeNodes[0]!.id).not.toBe(activeNodes[1]!.id);
  });

  it("uses stable transition ordering regardless of input order", () => {
    const alpha = transition("tr-alpha", "alpha", "START", "FORBIDDEN");
    const beta = transition("tr-beta", "beta", "START", "FORBIDDEN");
    const input = {
      initialState: { state: "START", facts: {} },
      forbiddenCondition: { targetState: "FORBIDDEN", requiredFacts: {} },
    };

    const first = searchForbiddenState({ ...input, transitions: [beta, alpha] });
    const second = searchForbiddenState({ ...input, transitions: [alpha, beta] });

    expect(first.status).toBe("found");
    expect(second.status).toBe("found");
    if (first.status !== "found" || second.status !== "found") return;
    expect(first.path.map((step) => step.id)).toEqual(["tr-alpha"]);
    expect(second.path.map((step) => step.id)).toEqual(["tr-alpha"]);
    expect(first.graph).toEqual(second.graph);
  });

  it("returns limit_reached when maxDepth leaves an unseen frontier", () => {
    const result = searchForbiddenState({
      initialState: { state: "A", facts: {} },
      transitions: [
        transition("tr-ab", "first", "A", "B"),
        transition("tr-bc", "second", "B", "C"),
      ],
      forbiddenCondition: { targetState: "C", requiredFacts: {} },
      limits: { maxDepth: 1 },
    });

    expect(result.status).toBe("limit_reached");
    if (result.status !== "limit_reached") return;
    expect(result.limitReason).toBe("maxDepth");
    expect(result.exploredStateCount).toBe(2);
  });

  it("can return unreachable at maxDepth when no unseen frontier remains", () => {
    const result = searchForbiddenState({
      initialState: { state: "TERMINAL", facts: {} },
      transitions: [],
      forbiddenCondition: { targetState: "OTHER", requiredFacts: {} },
      limits: { maxDepth: 0 },
    });

    expect(result.status).toBe("unreachable");
  });

  it("returns limit_reached when maxVisitedStates blocks a new state", () => {
    const result = searchForbiddenState({
      initialState: { state: "A", facts: {} },
      transitions: [transition("tr-ab", "advance", "A", "B")],
      forbiddenCondition: { targetState: "C", requiredFacts: {} },
      limits: { maxVisitedStates: 1 },
    });

    expect(result.status).toBe("limit_reached");
    if (result.status !== "limit_reached") return;
    expect(result.limitReason).toBe("maxVisitedStates");
    expect(result.exploredStateCount).toBe(1);
  });

  it("returns unreachable only after fully exhausting the modeled graph", () => {
    const result = searchForbiddenState({
      initialState: { state: "A", facts: {} },
      transitions: [transition("tr-ab", "advance", "A", "B")],
      forbiddenCondition: { targetState: "C", requiredFacts: {} },
      limits: { maxDepth: 5, maxVisitedStates: 10 },
    });

    expect(result.status).toBe("unreachable");
    expect(result.depth).toBeNull();
    expect(result.path).toEqual([]);
    expect(result.exploredStateCount).toBe(2);
  });

  it("rejects invalid bound values", () => {
    expect(() =>
      searchForbiddenState({
        initialState: { state: "A", facts: {} },
        transitions: [],
        forbiddenCondition: { targetState: "B", requiredFacts: {} },
        limits: { maxDepth: -1 },
      }),
    ).toThrow(RangeError);

    expect(() =>
      searchForbiddenState({
        initialState: { state: "A", facts: {} },
        transitions: [],
        forbiddenCondition: { targetState: "B", requiredFacts: {} },
        limits: { maxVisitedStates: 0 },
      }),
    ).toThrow(RangeError);
  });
});

describe("NeverGraphData projection", () => {
  const rule = {
    id: "RULE-001",
    description: "Published marked records are forbidden.",
    confidence: "high" as const,
    forbiddenCondition: {
      targetState: "PUBLISHED",
      requiredFacts: { marked: true },
    },
    evidence: [{ evidenceId: "ev-001", file: "fixtures/workflow.ts", line: 1 }],
  };

  it("builds a deterministic schema-valid graph and reachability status", () => {
    const graph = buildNeverGraph({
      initialState: { state: "DRAFT", facts: {} },
      transitions: [
        transition("tr-mark", "mark", "DRAFT", "READY", {}, { marked: true }),
        transition("tr-publish", "publish", "READY", "PUBLISHED"),
      ],
      rules: [rule],
    });

    expect(NeverGraphDataSchema.safeParse(graph).success).toBe(true);
    expect(graph.reachabilityStatus["RULE-001"]).toBe("reachable");
    expect(graph.nodes.some((node) => node.forbidden === true)).toBe(true);
  });

  it("maps an incomplete bounded search to the shared unknown status", () => {
    const graph = buildNeverGraph({
      initialState: { state: "DRAFT", facts: {} },
      transitions: [
        transition("tr-mark", "mark", "DRAFT", "READY", {}, { marked: true }),
        transition("tr-publish", "publish", "READY", "PUBLISHED"),
      ],
      rules: [rule],
      limits: { maxDepth: 1 },
    });

    expect(graph.reachabilityStatus["RULE-001"]).toBe("unknown");
  });
});
