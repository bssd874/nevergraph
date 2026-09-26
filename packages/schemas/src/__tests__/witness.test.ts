import { describe, it, expect } from "vitest";
import { WitnessSchema } from "../witness.js";

const validWitness = {
  ruleId: "NEVER-003",
  steps: [
    {
      action: "payOrder",
      fromState: { state: "CREATED", facts: { refunded: false, paid: false } },
      toState: { state: "PAID", facts: { refunded: false, paid: true } },
    },
    {
      action: "shipOrder",
      fromState: { state: "PAID", facts: { refunded: false, paid: true } },
      toState: { state: "SHIPPED", facts: { refunded: false, paid: true } },
    },
  ],
  length: 2,
  isForbidden: true,
};

describe("WitnessSchema", () => {
  it("parses a valid witness", () => {
    const result = WitnessSchema.safeParse(validWitness);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ruleId).toBe("NEVER-003");
      expect(result.data.steps).toHaveLength(2);
      // steps use GraphState objects, not plain strings
      expect(typeof result.data.steps[0]?.fromState).toBe("object");
      expect(result.data.steps[0]?.fromState.state).toBe("CREATED");
    }
  });

  it("steps use GraphState objects, not plain strings", () => {
    // Regression: steps must NOT accept { fromState: "PAID", toState: "SHIPPED" }
    const result = WitnessSchema.safeParse({
      ...validWitness,
      steps: [{ action: "shipOrder", fromState: "PAID", toState: "SHIPPED" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty steps array", () => {
    expect(WitnessSchema.safeParse({ ...validWitness, steps: [] }).success).toBe(false);
  });

  it("rejects missing ruleId", () => {
    const { ruleId: _ruleId, ...rest } = validWitness;
    expect(WitnessSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects missing length", () => {
    const { length: _length, ...rest } = validWitness;
    expect(WitnessSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects missing isForbidden", () => {
    const { isForbidden: _isForbidden, ...rest } = validWitness;
    expect(WitnessSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects non-positive length", () => {
    expect(WitnessSchema.safeParse({ ...validWitness, length: 0 }).success).toBe(false);
  });
});
