import { describe, it, expect } from "vitest";
import { EvidenceItemSchema, EvidenceTypeSchema } from "../evidence.js";

describe("EvidenceTypeSchema", () => {
  it("accepts all supported evidence types", () => {
    const types = ["guard", "state_transition", "negative_test", "throw", "comment", "constraint"];
    for (const t of types) {
      expect(EvidenceTypeSchema.safeParse(t).success).toBe(true);
    }
  });

  it("rejects an unsupported evidence type", () => {
    expect(EvidenceTypeSchema.safeParse("annotation").success).toBe(false);
  });
});

describe("EvidenceItemSchema", () => {
  const validItem = {
    id: "ev-001",
    type: "guard",
    file: "src/services/shipment.service.ts",
    line: 41,
    symbol: "shipOrder",
    snippet: "if (order.refundedAt) throw new InvalidStateTransition(...)",
    summary: "shipOrder blocks shipping when refundedAt is set",
    metadata: {},
  };

  it("parses a valid evidence item", () => {
    const result = EvidenceItemSchema.safeParse(validItem);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe("ev-001");
      expect(result.data.type).toBe("guard");
      expect(result.data.line).toBe(41);
    }
  });

  it("parses an evidence item with non-empty metadata", () => {
    const result = EvidenceItemSchema.safeParse({
      ...validItem,
      metadata: { guardField: "refundedAt", isNegative: true },
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing id", () => {
    const { id: _id, ...rest } = validItem;
    expect(EvidenceItemSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects missing type", () => {
    const { type: _type, ...rest } = validItem;
    expect(EvidenceItemSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects missing file", () => {
    const { file: _file, ...rest } = validItem;
    expect(EvidenceItemSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects missing line", () => {
    const { line: _line, ...rest } = validItem;
    expect(EvidenceItemSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects non-positive line number", () => {
    expect(EvidenceItemSchema.safeParse({ ...validItem, line: 0 }).success).toBe(false);
    expect(EvidenceItemSchema.safeParse({ ...validItem, line: -1 }).success).toBe(false);
  });

  it("rejects missing summary", () => {
    const { summary: _summary, ...rest } = validItem;
    expect(EvidenceItemSchema.safeParse(rest).success).toBe(false);
  });
});
