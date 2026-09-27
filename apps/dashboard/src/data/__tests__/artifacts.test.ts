import { describe, expect, it } from "vitest";
import { loadDashboardData } from "../load";
import {
  conditionClauses,
  deriveWitnessHighlight,
  diffTransitions,
  factGatedTransitions,
  findNodeId,
  firstBlockedStepIndex,
  formatGuard,
  layoutGraph,
  liveWitness,
  resolveEvidence,
  satisfiesCondition,
  scenarioFactKeys,
  scenarioVerdict,
  statesEqual,
  terminalScript,
  witnessStepViews,
} from "../derive";

/**
 * These tests assert the dashboard's data contract against the real artifacts
 * in `.nevergraph/`. They deliberately do not hard-code the golden values they
 * are checking (path actions, depths, counts) except where the assertion is
 * precisely that a value came from the snapshot rather than from the UI.
 */
const data = loadDashboardData();

describe("rules.json", () => {
  it("loads all five Bob-recovered Never Rules", () => {
    expect(data.rules).toHaveLength(5);
    expect(data.rules.map((rule) => rule.id)).toEqual([
      "NEVER-001",
      "NEVER-002",
      "NEVER-003",
      "NEVER-004",
      "NEVER-005",
    ]);
  });

  it("gives every rule a description, confidence and at least one evidence ref", () => {
    for (const rule of data.rules) {
      expect(rule.description.length).toBeGreaterThan(0);
      expect(["low", "medium", "high"]).toContain(rule.confidence);
      expect(rule.evidence.length).toBeGreaterThan(0);
    }
  });

  it("resolves NEVER-005 from real data with its real confidence and condition", () => {
    const rule = data.rules.find((candidate) => candidate.id === "NEVER-005");
    expect(rule).toBeDefined();
    expect(rule?.description).toBe("A refunded order must never be shipped");
    expect(rule?.confidence).toBe("high");
    expect(rule?.forbiddenCondition).toEqual({
      targetState: "SHIPPED",
      requiredFacts: { refundedAt: true },
    });
    expect(conditionClauses(rule!.forbiddenCondition)).toEqual([
      "state = SHIPPED",
      "refundedAt = true",
    ]);
  });

  it("uses NEVER-005 as the captured golden rule", () => {
    expect(data.goldenRuleId).toBe("NEVER-005");
    for (const scenario of ["baseline", "changed", "repaired"] as const) {
      expect(data.scenarios[scenario].selectedRule.id).toBe("NEVER-005");
    }
  });
});

describe("evidence resolution", () => {
  it("resolves every evidence id cited by every rule against evidence.json", () => {
    for (const rule of data.rules) {
      const resolved = resolveEvidence(rule, data.evidence);
      expect(resolved).toHaveLength(rule.evidence.length);
      for (const entry of resolved) {
        expect(entry.item, `${rule.id} cites unknown evidence ${entry.evidenceId}`).not.toBeNull();
        expect(entry.item?.id).toBe(entry.evidenceId);
      }
    }
  });

  it("resolves the NEVER-005 references to their real analyzer records", () => {
    const rule = data.rules.find((candidate) => candidate.id === "NEVER-005")!;
    const resolved = resolveEvidence(rule, data.evidence);

    expect(resolved.map((entry) => entry.evidenceId)).toEqual(["ev-013", "ev-026", "ev-027"]);
    for (const entry of resolved) {
      // The file/line cited by the rule must agree with the evidence record.
      expect(entry.item?.file).toBe(entry.citedFile);
      expect(entry.item?.line).toBe(entry.citedLine);
      expect(entry.item?.snippet.length).toBeGreaterThan(0);
    }

    // Multiple independent signal kinds back the rule.
    const types = new Set(resolved.map((entry) => entry.item?.type));
    expect(types.size).toBeGreaterThan(1);
    expect(types).toContain("negative_test");
  });
});

describe("baseline scenario", () => {
  const snapshot = data.scenarios.baseline;

  it("parses and reports UNREACHABLE with no witness and no proof run", () => {
    expect(snapshot.schemaVersion).toBe(1);
    expect(snapshot.search.status).toBe("unreachable");
    expect(snapshot.search.path).toHaveLength(0);
    expect(snapshot.witness).toBeNull();
    expect(snapshot.proof).toBeNull();
    expect(snapshot.search.exploredStateCount).toBeGreaterThan(0);
  });

  it("maps to a preserved verdict with an explored-state count", () => {
    const verdict = scenarioVerdict(snapshot);
    expect(verdict.searchLabel).toBe("UNREACHABLE");
    expect(verdict.searchTone).toBe("ok");
    expect(verdict.headline).toBe("NEGATIVE SPECIFICATION PRESERVED");
    expect(verdict.isRegression).toBe(false);
    expect(verdict.detail).toContain(String(snapshot.search.exploredStateCount));
    // Must not overclaim formal verification.
    expect(verdict.detail).toContain("bounded");
  });

  it("contains no node satisfying the forbidden condition", () => {
    const forbidden = snapshot.graph.nodes.filter((node) =>
      satisfiesCondition(node.graphState, snapshot.selectedRule.forbiddenCondition),
    );
    expect(forbidden).toHaveLength(0);
  });
});

describe("changed scenario", () => {
  const snapshot = data.scenarios.changed;

  it("parses and maps to FOUND + REPRODUCED", () => {
    expect(snapshot.search.status).toBe("found");
    expect(snapshot.proof?.status).toBe("reproduced");
    expect(snapshot.proof?.testResult).toBe("fail");
    expect(snapshot.proof?.exitCode).toBe(1);

    const verdict = scenarioVerdict(snapshot);
    expect(verdict.searchLabel).toBe("FOUND");
    expect(verdict.searchTone).toBe("bad");
    expect(verdict.proofLabel).toBe("REPRODUCED");
    expect(verdict.proofTone).toBe("bad");
    expect(verdict.headline).toBe("NEGATIVE SPECIFICATION REGRESSION");
    expect(verdict.isRegression).toBe(true);
  });

  it("takes the witness path from snapshot data, not from the UI", () => {
    const witness = liveWitness(snapshot);
    expect(witness).not.toBeNull();

    const actionsFromWitness = witness!.steps.map((step) => step.action);
    const actionsFromSearchPath = snapshot.search.path.map((transition) => transition.action);

    // The two independently captured views of the path must agree...
    expect(actionsFromWitness).toEqual(actionsFromSearchPath);
    // ...and the rendered step list must be exactly that sequence.
    expect(witnessStepViews(snapshot).map((step) => step.action)).toEqual(actionsFromWitness);

    expect(witness!.length).toBe(actionsFromWitness.length);
    expect(snapshot.search.depth).toBe(witness!.length);
    expect(witness!.isForbidden).toBe(true);
  });

  it("ends in a state that satisfies the forbidden condition", () => {
    const witness = liveWitness(snapshot)!;
    const final = witness.steps[witness.steps.length - 1].toState;

    expect(satisfiesCondition(final, snapshot.selectedRule.forbiddenCondition)).toBe(true);
    expect(final.state).toBe("SHIPPED");
    expect(final.facts.refundedAt).toBe(true);
    expect(snapshot.search.finalState).not.toBeNull();
    expect(statesEqual(final, snapshot.search.finalState!)).toBe(true);
  });

  it("highlights the witness against real graph nodes and edges", () => {
    const highlight = deriveWitnessHighlight(liveWitness(snapshot), snapshot.graph.nodes);
    const witness = liveWitness(snapshot)!;

    // One node per state visited: steps + the entry state.
    expect(highlight.nodeIds).toHaveLength(witness.length + 1);
    expect(highlight.edgeKeys.size).toBe(witness.length);
    expect(highlight.forbiddenNodeId).not.toBeNull();

    const forbiddenNode = snapshot.graph.nodes.find(
      (node) => node.id === highlight.forbiddenNodeId,
    );
    expect(forbiddenNode).toBeDefined();
    expect(
      satisfiesCondition(forbiddenNode!.graphState, snapshot.selectedRule.forbiddenCondition),
    ).toBe(true);

    // The entry state of the path is the snapshot's initial state.
    const rootId = findNodeId(snapshot.graph.nodes, snapshot.initialState);
    expect(highlight.nodeIds[0]).toBe(rootId);
  });

  it("introduces a transition the baseline did not have", () => {
    const diff = diffTransitions(data.scenarios.baseline.transitions, snapshot.transitions);
    expect(diff.added.length).toBeGreaterThan(0);
    expect(diff.removed).toHaveLength(0);
  });
});

describe("repaired scenario", () => {
  const snapshot = data.scenarios.repaired;

  it("parses and maps to UNREACHABLE + NOT_REPRODUCED / PASS", () => {
    expect(snapshot.search.status).toBe("unreachable");
    expect(snapshot.search.path).toHaveLength(0);
    expect(snapshot.proof?.status).toBe("not_reproduced");
    expect(snapshot.proof?.testResult).toBe("pass");
    expect(snapshot.proof?.exitCode).toBe(0);

    const verdict = scenarioVerdict(snapshot);
    expect(verdict.searchLabel).toBe("UNREACHABLE");
    expect(verdict.searchTone).toBe("ok");
    expect(verdict.proofLabel).toBe("NOT_REPRODUCED");
    expect(verdict.proofTone).toBe("ok");
    expect(verdict.headline).toBe("NEGATIVE SPECIFICATION PRESERVED");
    expect(verdict.isRegression).toBe(false);
  });

  it("runs the same generated regression file as the changed scenario", () => {
    expect(snapshot.proof?.testFile).toBe(data.scenarios.changed.proof?.testFile);
    expect(snapshot.proof?.identifier).toBe(data.scenarios.changed.proof?.identifier);
  });

  it("never surfaces its archived witness as a live counterexample", () => {
    // The snapshot does carry the historical witness the regression test replays.
    expect(snapshot.witness).not.toBeNull();
    // ...but it must not be treated as a current violation.
    expect(liveWitness(snapshot)).toBeNull();
    expect(deriveWitnessHighlight(liveWitness(snapshot), snapshot.graph.nodes).nodeIds).toEqual([]);
  });

  it("gates the restore transition on the fact the rule depends on", () => {
    const gates = factGatedTransitions(snapshot);
    expect(gates.length).toBeGreaterThan(0);

    const ruleFactKeys = Object.keys(snapshot.selectedRule.forbiddenCondition.requiredFacts);
    const constraintText = gates.flatMap((gate) => gate.constraints.map((item) => item.text));
    expect(constraintText.some((text) => ruleFactKeys.some((key) => text.includes(key)))).toBe(true);

    // The changed capture had no such gate — that is the repair.
    const changedGates = factGatedTransitions(data.scenarios.changed);
    expect(changedGates).toHaveLength(0);
  });

  it("identifies the exact step of the archived path the repair now blocks", () => {
    const blocked = firstBlockedStepIndex(snapshot);
    expect(blocked).not.toBeNull();

    const steps = witnessStepViews(snapshot);
    const blockedStep = steps[blocked!];

    // The blocked step must be the transition the repair constrained...
    const constrained = diffTransitions(
      data.scenarios.changed.transitions,
      snapshot.transitions,
    ).modified.map((entry) => entry.after.action);
    expect(constrained).toContain(blockedStep.action);

    // ...and every earlier step must still be takeable.
    for (const earlier of steps.slice(0, blocked!)) {
      expect(firstBlockedStepIndex(snapshot)).not.toBe(steps.indexOf(earlier));
    }

    // The changed scenario admits the whole path — nothing blocks it there.
    expect(firstBlockedStepIndex(data.scenarios.changed)).toBeNull();
  });

  it("adds a constraint to the transition that enabled the violation", () => {
    const diff = diffTransitions(data.scenarios.changed.transitions, snapshot.transitions);
    expect(diff.added).toHaveLength(0);
    expect(diff.modified.length).toBeGreaterThan(0);

    const withNewConstraint = diff.modified.filter(
      (entry) => entry.addedGuards.length > 0 || entry.addedFactPreconditions.length > 0,
    );
    expect(withNewConstraint.length).toBeGreaterThan(0);
  });
});

describe("context-aware state identity", () => {
  it("keeps identical lifecycle statuses distinct when their facts differ", () => {
    const changed = data.scenarios.changed;
    const byLabel = new Map<string, typeof changed.graph.nodes>();
    for (const node of changed.graph.nodes) {
      const bucket = byLabel.get(node.label) ?? [];
      bucket.push(node);
      byLabel.set(node.label, bucket);
    }

    const paid = byLabel.get("PAID") ?? [];
    expect(paid.length).toBeGreaterThan(1);

    // Every PAID node shares the status but has a distinct fact context.
    const ids = new Set(paid.map((node) => node.id));
    expect(ids.size).toBe(paid.length);
    for (const [index, node] of paid.entries()) {
      for (const other of paid.slice(index + 1)) {
        expect(statesEqual(node.graphState, other.graphState)).toBe(false);
      }
    }

    // The dangerous context — PAID carrying a historical refund — exists here,
    // and is what makes the forbidden SHIPPED state reachable.
    const withHistoricalRefund = paid.filter((node) => node.graphState.facts.refundedAt === true);
    const withoutRefund = paid.filter((node) => node.graphState.facts.refundedAt === undefined);
    expect(withHistoricalRefund.length).toBeGreaterThan(0);
    expect(withoutRefund.length).toBeGreaterThan(0);
  });

  it("removes the historical-refund PAID context after the repair", () => {
    const repairedPaid = data.scenarios.repaired.graph.nodes.filter(
      (node) => node.label === "PAID",
    );
    expect(repairedPaid.length).toBeGreaterThan(0);
    expect(repairedPaid.every((node) => node.graphState.facts.refundedAt !== true)).toBe(true);
  });

  it("always exposes the fact keys the forbidden condition depends on", () => {
    for (const scenario of ["baseline", "changed", "repaired"] as const) {
      const snapshot = data.scenarios[scenario];
      const keys = scenarioFactKeys(snapshot);
      for (const required of Object.keys(
        snapshot.selectedRule.forbiddenCondition.requiredFacts,
      )) {
        expect(keys, `${scenario} hides ${required}`).toContain(required);
      }
    }
  });
});

describe("graph layout", () => {
  it("positions every node deterministically with the entry state first", () => {
    for (const scenario of ["baseline", "changed", "repaired"] as const) {
      const snapshot = data.scenarios[scenario];
      const first = layoutGraph(snapshot);
      const second = layoutGraph(snapshot);

      expect(first.nodes).toHaveLength(snapshot.graph.nodes.length);
      expect(second.nodes.map((entry) => [entry.node.id, entry.x, entry.y])).toEqual(
        first.nodes.map((entry) => [entry.node.id, entry.x, entry.y]),
      );

      const rootId = findNodeId(snapshot.graph.nodes, snapshot.initialState);
      const root = first.nodes.find((entry) => entry.node.id === rootId);
      expect(root?.layer).toBe(0);
      expect(root?.x).toBe(0);
    }
  });

  it("layers the changed scenario so the forbidden state sits at the witness depth", () => {
    const snapshot = data.scenarios.changed;
    const layout = layoutGraph(snapshot);
    const highlight = deriveWitnessHighlight(liveWitness(snapshot), snapshot.graph.nodes);
    const forbidden = layout.nodes.find(
      (entry) => entry.node.id === highlight.forbiddenNodeId,
    );
    expect(forbidden?.layer).toBe(snapshot.search.depth);
  });

  it("merges parallel edges without losing any source edge id", () => {
    for (const scenario of ["baseline", "changed", "repaired"] as const) {
      const snapshot = data.scenarios[scenario];
      const layout = layoutGraph(snapshot);
      const collapsed = layout.edges.flatMap((edge) => edge.sourceEdgeIds);
      expect(collapsed.sort()).toEqual(snapshot.graph.edges.map((edge) => edge.id).sort());
      expect(new Set(layout.edges.map((edge) => edge.id)).size).toBe(layout.edges.length);
    }
  });
});

describe("terminal transcript", () => {
  it("derives its status lines from the snapshot, with no timings", () => {
    const changed = terminalScript(data.scenarios.changed).map((line) => line.text);
    const repaired = terminalScript(data.scenarios.repaired).map((line) => line.text);

    expect(changed.join("\n")).toContain("FORBIDDEN BEHAVIOR REPRODUCED");
    expect(changed.join("\n")).toContain("exit 1");
    expect(changed.some((text) => text.includes("payOrder → refundOrder"))).toBe(true);

    expect(repaired.join("\n")).toContain("NEGATIVE SPECIFICATION PRESERVED");
    expect(repaired.join("\n")).toContain("exit 0");

    // No fabricated durations anywhere in the transcript.
    for (const text of [...changed, ...repaired]) {
      expect(text).not.toMatch(/\d+\s*(ms|s\b|sec|seconds)/i);
    }
  });

  it("reports the real explored-state count and depth bound", () => {
    for (const scenario of ["baseline", "changed", "repaired"] as const) {
      const snapshot = data.scenarios[scenario];
      const transcript = terminalScript(snapshot)
        .map((line) => line.text)
        .join("\n");
      expect(transcript).toContain(String(snapshot.search.exploredStateCount));
      expect(transcript).toContain(String(snapshot.search.limits.maxDepth));
    }
  });
});

describe("guard rendering", () => {
  it("renders guards as rejection conditions, never as requirements", () => {
    // The analyzer only extracts guards whose if-body throws, so a guard shown
    // bare would read as the opposite of what the code does.
    const guards = data.scenarios.repaired.transitions.flatMap(
      (transition) => transition.guards,
    );
    expect(guards.length).toBeGreaterThan(0);

    for (const guard of guards) {
      expect(formatGuard(guard)).toMatch(/^throw if /);
    }

    const restore = data.scenarios.repaired.transitions.find(
      (transition) => transition.action === "restoreOrder",
    );
    expect(restore).toBeDefined();
    expect(restore!.guards.map(formatGuard)).toContain("throw if refundedAt ≠ null");
    // The graph-evaluated form of the same constraint is the precondition.
    expect(restore!.from.facts.refundedAt).toBeNull();
  });
});

describe("repository metadata", () => {
  it("comes from the analysis target's own manifest", () => {
    expect(data.repository.packageName).toBe("@nevergraph/mercury");
    expect(data.repository.name).toBe("mercury");
    expect(data.repository.path).toBe("demo/mercury");
    expect(data.repository.description).not.toBeNull();
  });
});
