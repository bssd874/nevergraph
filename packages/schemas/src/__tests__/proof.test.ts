import { describe, it, expect } from "vitest";
import { ProofReceiptSchema } from "../proof.js";

const validWitness = {
  ruleId: "NEVER-003",
  steps: [
    {
      action: "shipOrder",
      fromState: { state: "PAID", facts: { refunded: true } },
      toState: { state: "SHIPPED", facts: { refunded: true } },
    },
  ],
  length: 1,
  isForbidden: true,
};

const validReceipt = {
  ruleId: "NEVER-003",
  foundViolation: true,
  witness: validWitness,
  testFile: "demo/mercury/tests/regression/NEVER-003.spec.ts",
  testResult: "fail" as const,
  repairApplied: false,
  verificationResult: "not_run" as const,
  existingTestsResult: "not_run" as const,
  status: "reproduced" as const,
  timestamp: "2025-01-01T00:00:00.000Z",
};

describe("ProofReceiptSchema", () => {
  it("parses a valid proof receipt in reproduced state", () => {
    const result = ProofReceiptSchema.safeParse(validReceipt);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ruleId).toBe("NEVER-003");
      expect(result.data.status).toBe("reproduced");
      expect(result.data.testResult).toBe("fail");
    }
  });

  it("parses a verified receipt with null witness (already repaired)", () => {
    const result = ProofReceiptSchema.safeParse({
      ...validReceipt,
      witness: null,
      foundViolation: false,
      testResult: "pass",
      repairApplied: true,
      verificationResult: "pass",
      existingTestsResult: "pass",
      status: "verified",
    });
    expect(result.success).toBe(true);
  });

  it("accepts all valid status values", () => {
    for (const status of ["suspected", "reproduced", "fixed", "verified"]) {
      expect(ProofReceiptSchema.safeParse({ ...validReceipt, status }).success).toBe(true);
    }
  });

  it("accepts all valid testResult values", () => {
    for (const testResult of ["pass", "fail", "error", "not_run"]) {
      expect(ProofReceiptSchema.safeParse({ ...validReceipt, testResult }).success).toBe(true);
    }
  });

  it("rejects invalid status", () => {
    expect(ProofReceiptSchema.safeParse({ ...validReceipt, status: "pending" }).success).toBe(false);
  });

  it("rejects missing ruleId", () => {
    const { ruleId: _ruleId, ...rest } = validReceipt;
    expect(ProofReceiptSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects missing foundViolation", () => {
    const { foundViolation: _fv, ...rest } = validReceipt;
    expect(ProofReceiptSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects missing timestamp", () => {
    const { timestamp: _ts, ...rest } = validReceipt;
    expect(ProofReceiptSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects invalid ISO 8601 timestamp", () => {
    expect(ProofReceiptSchema.safeParse({ ...validReceipt, timestamp: "not-a-date" }).success).toBe(false);
  });

  it("distinguishes error from fail — infrastructure crash must not be treated as violation", () => {
    const errorReceipt = { ...validReceipt, testResult: "error", status: "suspected" };
    const result = ProofReceiptSchema.safeParse(errorReceipt);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.testResult).toBe("error");
      expect(result.data.status).toBe("suspected");
    }
  });
});
