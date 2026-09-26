import { describe, it, expect } from "vitest";
import { GraphStateSchema, GuardSignalSchema } from "../graph-state.js";

describe("GraphStateSchema", () => {
  it("parses a valid GraphState with populated facts", () => {
    const result = GraphStateSchema.safeParse({
      state: "PAID",
      facts: { refunded: false, paid: true },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.state).toBe("PAID");
      expect(result.data.facts["refunded"]).toBe(false);
    }
  });

  it("parses a valid GraphState with empty facts", () => {
    const result = GraphStateSchema.safeParse({ state: "CREATED", facts: {} });
    expect(result.success).toBe(true);
  });

  it("parses facts with mixed value types", () => {
    const result = GraphStateSchema.safeParse({
      state: "SHIPPED",
      facts: { refunded: true, orderId: "abc", count: 3, nullable: null },
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing state", () => {
    const result = GraphStateSchema.safeParse({ facts: {} });
    expect(result.success).toBe(false);
  });

  it("rejects empty state string", () => {
    const result = GraphStateSchema.safeParse({ state: "", facts: {} });
    expect(result.success).toBe(false);
  });

  it("rejects missing facts", () => {
    const result = GraphStateSchema.safeParse({ state: "PAID" });
    expect(result.success).toBe(false);
  });
});

describe("GuardSignalSchema", () => {
  it("parses a truthy guard", () => {
    const result = GuardSignalSchema.safeParse({
      field: "refunded",
      operator: "truthy",
      value: null,
    });
    expect(result.success).toBe(true);
  });

  it("parses an eq guard with a boolean value", () => {
    const result = GuardSignalSchema.safeParse({
      field: "paid",
      operator: "eq",
      value: true,
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing field", () => {
    const result = GuardSignalSchema.safeParse({ operator: "truthy", value: null });
    expect(result.success).toBe(false);
  });

  it("rejects invalid operator", () => {
    const result = GuardSignalSchema.safeParse({
      field: "refunded",
      operator: "gt",
      value: null,
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing operator", () => {
    const result = GuardSignalSchema.safeParse({ field: "refunded", value: null });
    expect(result.success).toBe(false);
  });
});
