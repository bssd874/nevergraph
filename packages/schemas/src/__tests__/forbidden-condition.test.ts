import { describe, it, expect } from "vitest";
import { ForbiddenConditionSchema } from "../forbidden-condition.js";

describe("ForbiddenConditionSchema", () => {
  it("parses a valid forbidden condition with one required fact", () => {
    const result = ForbiddenConditionSchema.safeParse({
      targetState: "SHIPPED",
      requiredFacts: { refunded: true },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.targetState).toBe("SHIPPED");
      expect(result.data.requiredFacts["refunded"]).toBe(true);
    }
  });

  it("parses a forbidden condition with empty requiredFacts", () => {
    // A condition with no required facts means the state alone is forbidden.
    const result = ForbiddenConditionSchema.safeParse({
      targetState: "DELETED",
      requiredFacts: {},
    });
    expect(result.success).toBe(true);
  });

  it("parses a forbidden condition with mixed fact value types", () => {
    const result = ForbiddenConditionSchema.safeParse({
      targetState: "SHIPPED",
      requiredFacts: { refunded: true, tier: "premium", count: 0, extra: null },
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing targetState", () => {
    const result = ForbiddenConditionSchema.safeParse({
      requiredFacts: { refunded: true },
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty targetState string", () => {
    const result = ForbiddenConditionSchema.safeParse({
      targetState: "",
      requiredFacts: {},
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing requiredFacts", () => {
    const result = ForbiddenConditionSchema.safeParse({
      targetState: "SHIPPED",
    });
    expect(result.success).toBe(false);
  });

  it("does not contain any Mercury-specific field names in the schema keys", () => {
    // Smoke-test: the schema shape itself must not reference domain fields.
    const shape = Object.keys(ForbiddenConditionSchema.shape);
    const domainFields = ["refundedAt", "paidAt", "cancelledAt", "status"];
    for (const field of domainFields) {
      expect(shape).not.toContain(field);
    }
  });
});
