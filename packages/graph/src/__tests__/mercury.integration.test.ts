import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  StateTransitionSchema,
  type StateTransition,
} from "@nevergraph/schemas";
import { searchForbiddenState } from "../index.js";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const transitionFile = path.resolve(
  currentDirectory,
  "../../../../.nevergraph/transitions.json",
);

function loadBaselineTransitions(): StateTransition[] {
  return StateTransitionSchema.array().parse(
    JSON.parse(readFileSync(transitionFile, "utf8")),
  );
}

const initialState = { state: "CREATED", facts: {} };
const testOnlyForbiddenCondition = {
  targetState: "SHIPPED",
  requiredFacts: { refundedAt: true },
};

describe("Mercury analyzer-output integration", () => {
  it("reports the safe baseline as fully unreachable", () => {
    const result = searchForbiddenState({
      initialState,
      transitions: loadBaselineTransitions(),
      forbiddenCondition: testOnlyForbiddenCondition,
    });

    expect(result.status).toBe("unreachable");
    expect(result.finalState).toBeNull();
    expect(result.path).toEqual([]);
  });

  it("finds the history-sensitive path with a test-only restore transition", () => {
    const syntheticRestore: StateTransition = {
      id: "tr-test-restore",
      action: "restoreOrder",
      from: { state: "CANCELLED", facts: {} },
      to: { state: "PAID", facts: {} },
      file: "test-only/synthetic-restore.ts",
      line: 1,
      guards: [],
    };

    const result = searchForbiddenState({
      initialState,
      transitions: [...loadBaselineTransitions(), syntheticRestore],
      forbiddenCondition: testOnlyForbiddenCondition,
    });

    expect(result.status).toBe("found");
    if (result.status !== "found") return;

    expect(result.depth).toBe(5);
    expect(result.path.map((step) => step.action)).toEqual([
      "payOrder",
      "refundOrder",
      "cancelOrder",
      "restoreOrder",
      "shipOrder",
    ]);
    expect(result.finalState.state).toBe("SHIPPED");
    expect(result.finalState.facts["refundedAt"]).toBe(true);
    expect(result.finalState.facts).toMatchObject({
      paidAt: true,
      refundedAt: true,
      cancelledAt: true,
      shippedAt: true,
    });
  });
});
