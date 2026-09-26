import { describe, it, expect } from "vitest";
import { StateTransitionSchema } from "../transition.js";
import type { GraphState } from "../graph-state.js";

const paidState: GraphState = { state: "PAID", facts: { refunded: false, paid: true } };
const shippedState: GraphState = { state: "SHIPPED", facts: { refunded: false, paid: true } };
const unknownState: GraphState = { state: "UNKNOWN", facts: {} };

describe("StateTransitionSchema", () => {
  const validTransition = {
    id: "tr-001",
    action: "shipOrder",
    from: paidState,
    to: shippedState,
    file: "src/services/shipment.service.ts",
    line: 55,
    guards: [{ field: "refunded", operator: "falsy", value: null }],
  };

  it("parses a valid transition with GraphState from and to", () => {
    const result = StateTransitionSchema.safeParse(validTransition);
    expect(result.success).toBe(true);
    if (result.success) {
      // from and to must be GraphState objects, not plain strings
      expect(typeof result.data.from).toBe("object");
      expect(typeof result.data.to).toBe("object");
      expect(result.data.from.state).toBe("PAID");
      expect(result.data.to.state).toBe("SHIPPED");
    }
  });

  it("parses a transition with UNKNOWN from state", () => {
    const result = StateTransitionSchema.safeParse({
      ...validTransition,
      from: unknownState,
    });
    expect(result.success).toBe(true);
  });

  it("parses a transition with empty guards array", () => {
    const result = StateTransitionSchema.safeParse({ ...validTransition, guards: [] });
    expect(result.success).toBe(true);
  });

  it("from.state must be a GraphState object, not a plain string", () => {
    // Regression: from must NOT accept bare string "PAID"
    const result = StateTransitionSchema.safeParse({ ...validTransition, from: "PAID" });
    expect(result.success).toBe(false);
  });

  it("to.state must be a GraphState object, not a plain string", () => {
    const result = StateTransitionSchema.safeParse({ ...validTransition, to: "SHIPPED" });
    expect(result.success).toBe(false);
  });

  it("rejects missing id", () => {
    const { id: _id, ...rest } = validTransition;
    expect(StateTransitionSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects missing action", () => {
    const { action: _action, ...rest } = validTransition;
    expect(StateTransitionSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects non-positive line number", () => {
    expect(StateTransitionSchema.safeParse({ ...validTransition, line: 0 }).success).toBe(false);
  });
});
