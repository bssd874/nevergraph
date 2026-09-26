import { describe, it, expect } from "vitest";
import { NeverRuleSchema } from "../rule.js";

const validRule = {
  id: "NEVER-001",
  description: "A cancelled order must never become shipped.",
  confidence: "high" as const,
  forbiddenCondition: {
    targetState: "SHIPPED",
    requiredFacts: { cancelled: true },
  },
  evidence: [
    { evidenceId: "ev-001", file: "src/services/shipment.service.ts", line: 41 },
    { evidenceId: "ev-007", file: "src/tests/order.spec.ts", line: 88 },
  ],
};

describe("NeverRuleSchema", () => {
  it("parses a valid NeverRule", () => {
    const result = NeverRuleSchema.safeParse(validRule);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe("NEVER-001");
      expect(result.data.confidence).toBe("high");
      expect(result.data.forbiddenCondition.targetState).toBe("SHIPPED");
      expect(result.data.forbiddenCondition.requiredFacts["cancelled"]).toBe(true);
    }
  });

  it("forbiddenCondition uses structured ForbiddenCondition, not a plain string", () => {
    // Regression: forbiddenCondition must NOT accept a free-form string
    const result = NeverRuleSchema.safeParse({
      ...validRule,
      forbiddenCondition: "A cancelled order must never become shipped.",
    });
    expect(result.success).toBe(false);
  });

  it("accepts all confidence levels", () => {
    for (const confidence of ["low", "medium", "high"]) {
      expect(NeverRuleSchema.safeParse({ ...validRule, confidence }).success).toBe(true);
    }
  });

  it("rejects invalid confidence level", () => {
    expect(NeverRuleSchema.safeParse({ ...validRule, confidence: "critical" }).success).toBe(false);
  });

  it("rejects missing id", () => {
    const { id: _id, ...rest } = validRule;
    expect(NeverRuleSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects missing description", () => {
    const { description: _desc, ...rest } = validRule;
    expect(NeverRuleSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects missing forbiddenCondition", () => {
    const { forbiddenCondition: _fc, ...rest } = validRule;
    expect(NeverRuleSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects empty evidence array", () => {
    expect(NeverRuleSchema.safeParse({ ...validRule, evidence: [] }).success).toBe(false);
  });

  it("rejects evidence item missing evidenceId", () => {
    const result = NeverRuleSchema.safeParse({
      ...validRule,
      evidence: [{ file: "src/foo.ts", line: 1 }],
    });
    expect(result.success).toBe(false);
  });
});
