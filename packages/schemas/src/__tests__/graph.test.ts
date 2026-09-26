import { describe, it, expect } from "vitest";
import { NeverGraphDataSchema } from "../graph.js";

const validGraph = {
  nodes: [
    { id: "CREATED|{}", label: "CREATED" },
    { id: "PAID|{}", label: "PAID" },
    { id: "SHIPPED|{refunded:false}", label: "SHIPPED" },
    { id: "SHIPPED|{refunded:true}", label: "SHIPPED (refunded)", forbidden: true },
  ],
  edges: [
    { id: "e-1", source: "CREATED|{}", target: "PAID|{}", action: "payOrder" },
    { id: "e-2", source: "PAID|{}", target: "SHIPPED|{refunded:false}", action: "shipOrder" },
  ],
  forbiddenConditions: [
    {
      id: "NEVER-001",
      description: "A cancelled order must never become shipped.",
      confidence: "high",
      forbiddenCondition: { targetState: "SHIPPED", requiredFacts: { cancelled: true } },
      evidence: [
        { evidenceId: "ev-001", file: "src/services/shipment.service.ts", line: 41 },
        { evidenceId: "ev-002", file: "src/tests/order.spec.ts", line: 88 },
      ],
    },
  ],
  reachabilityStatus: { "NEVER-001": "unreachable" },
};

describe("NeverGraphDataSchema", () => {
  it("parses a valid NeverGraph", () => {
    const result = NeverGraphDataSchema.safeParse(validGraph);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.nodes).toHaveLength(4);
      expect(result.data.edges).toHaveLength(2);
      expect(result.data.reachabilityStatus["NEVER-001"]).toBe("unreachable");
    }
  });

  it("parses with empty nodes and edges", () => {
    const result = NeverGraphDataSchema.safeParse({ ...validGraph, nodes: [], edges: [] });
    expect(result.success).toBe(true);
  });

  it("accepts all reachability statuses", () => {
    for (const status of ["unreachable", "reachable", "unknown"]) {
      const result = NeverGraphDataSchema.safeParse({
        ...validGraph,
        reachabilityStatus: { "NEVER-001": status },
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid reachability status", () => {
    const result = NeverGraphDataSchema.safeParse({
      ...validGraph,
      reachabilityStatus: { "NEVER-001": "safe" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing nodes", () => {
    const { nodes: _nodes, ...rest } = validGraph;
    expect(NeverGraphDataSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects missing edges", () => {
    const { edges: _edges, ...rest } = validGraph;
    expect(NeverGraphDataSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects missing forbiddenConditions", () => {
    const { forbiddenConditions: _fc, ...rest } = validGraph;
    expect(NeverGraphDataSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects missing reachabilityStatus", () => {
    const { reachabilityStatus: _rs, ...rest } = validGraph;
    expect(NeverGraphDataSchema.safeParse(rest).success).toBe(false);
  });

  it("node with forbidden=true is valid", () => {
    const result = NeverGraphDataSchema.safeParse({
      ...validGraph,
      nodes: [{ id: "x", label: "X", forbidden: true }],
    });
    expect(result.success).toBe(true);
  });
});
