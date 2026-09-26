/**
 * mercury.integration.test.ts — Level 2 Mercury integration test
 *
 * Runs the full analyzer against demo/mercury/ and asserts structural expectations.
 * Does NOT assert NeverRule objects. Does NOT generate NEVER IDs.
 * Only asserts factual observations about transitions and evidence shapes.
 */

import { describe, it, expect, beforeAll } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeRepository, AnalyzeResult } from "../index.js";
import { StateTransition, EvidenceItem } from "@nevergraph/schemas";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// From packages/analyzer/src/__tests__/ -> monorepo root -> demo/mercury
const MERCURY_ROOT = path.resolve(__dirname, "../../../../demo/mercury");

let result: AnalyzeResult;

beforeAll(() => {
  result = analyzeRepository({ repoRoot: MERCURY_ROOT });
});

// ---------------------------------------------------------------------------
// Basic structure
// ---------------------------------------------------------------------------

describe("Mercury analysis — basic structure", () => {
  it("returns non-empty evidence array", () => {
    expect(result.evidence.length).toBeGreaterThan(0);
  });

  it("returns non-empty transitions array", () => {
    expect(result.transitions.length).toBeGreaterThan(0);
  });

  it("all evidence items have required schema fields", () => {
    for (const ev of result.evidence) {
      expect(ev.id).toBeTruthy();
      expect(ev.type).toBeTruthy();
      expect(ev.file).toBeTruthy();
      expect(ev.line).toBeGreaterThan(0);
      expect(ev.symbol).toBeTruthy();
      expect(ev.snippet).toBeTruthy();
      expect(ev.summary).toBeTruthy();
    }
  });

  it("all transitions have required schema fields", () => {
    for (const tr of result.transitions) {
      expect(tr.id).toBeTruthy();
      expect(tr.action).toBeTruthy();
      expect(tr.from.state).toBeTruthy();
      expect(tr.to.state).toBeTruthy();
      expect(tr.file).toBeTruthy();
      expect(tr.line).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Evidence types
// ---------------------------------------------------------------------------

describe("Mercury analysis — evidence types", () => {
  it("contains guard evidence", () => {
    const guards = result.evidence.filter(e => e.type === "guard");
    expect(guards.length).toBeGreaterThan(0);
  });

  it("contains throw evidence", () => {
    const throws = result.evidence.filter(e => e.type === "throw");
    expect(throws.length).toBeGreaterThan(0);
  });

  it("contains state_transition evidence", () => {
    const st = result.evidence.filter(e => e.type === "state_transition");
    expect(st.length).toBeGreaterThan(0);
  });

  it("contains negative_test evidence", () => {
    const nt = result.evidence.filter(e => e.type === "negative_test");
    expect(nt.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Transitions — AC-2.12 through AC-2.16
// ---------------------------------------------------------------------------

function findTransition(
  transitions: StateTransition[],
  fromState: string,
  toState: string,
): StateTransition | undefined {
  return transitions.find(
    t => t.from.state === fromState && t.to.state === toState,
  );
}

describe("Mercury analysis — transitions", () => {
  it("AC-2.12: derives CREATED -> PAID", () => {
    expect(findTransition(result.transitions, "CREATED", "PAID")).toBeDefined();
  });

  it("AC-2.13: derives PAID -> REFUNDED", () => {
    expect(findTransition(result.transitions, "PAID", "REFUNDED")).toBeDefined();
  });

  it("AC-2.14: derives PAID -> CANCELLED", () => {
    expect(findTransition(result.transitions, "PAID", "CANCELLED")).toBeDefined();
  });

  it("AC-2.15: derives REFUNDED -> CANCELLED", () => {
    expect(findTransition(result.transitions, "REFUNDED", "CANCELLED")).toBeDefined();
  });

  it("AC-2.16: derives PAID -> SHIPPED", () => {
    expect(findTransition(result.transitions, "PAID", "SHIPPED")).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// AC-2.17: Refund transition records the refund fact update
// ---------------------------------------------------------------------------

describe("Mercury analysis — refund fact (AC-2.17)", () => {
  it("PAID -> REFUNDED transition records refundedAt fact as true", () => {
    const tr = findTransition(result.transitions, "PAID", "REFUNDED");
    expect(tr).toBeDefined();
    // The refund operation assigns refundedAt = new Date() — normalized to true
    expect(tr!.to.facts["refundedAt"]).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AC-2.18: Cancel does NOT falsely clear the refund fact
// ---------------------------------------------------------------------------

describe("Mercury analysis — cancel does not clear refund fact (AC-2.18)", () => {
  it("REFUNDED -> CANCELLED transition does not contain refundedAt in to.facts", () => {
    const tr = findTransition(result.transitions, "REFUNDED", "CANCELLED");
    expect(tr).toBeDefined();
    // cancelOrder does NOT assign refundedAt, so it must not appear in to.facts
    expect(tr!.to.facts).not.toHaveProperty("refundedAt");
  });

  it("PAID -> CANCELLED transition does not contain refundedAt in to.facts", () => {
    const tr = findTransition(result.transitions, "PAID", "CANCELLED");
    expect(tr).toBeDefined();
    expect(tr!.to.facts).not.toHaveProperty("refundedAt");
  });

  it("PAID -> CANCELLED transition records cancelledAt fact as true", () => {
    const tr = findTransition(result.transitions, "PAID", "CANCELLED");
    expect(tr).toBeDefined();
    expect(tr!.to.facts["cancelledAt"]).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Negative test coverage
// ---------------------------------------------------------------------------

describe("Mercury analysis — negative test evidence", () => {
  function negTests(): EvidenceItem[] {
    return result.evidence.filter(e => e.type === "negative_test");
  }

  it("has negative tests covering multiple operations", () => {
    const ops = new Set(
      negTests()
        .map(e => (e.metadata as any)["testedOperation"])
        .filter(Boolean),
    );
    expect(ops.size).toBeGreaterThanOrEqual(3);
  });

  it("has a negative test for shipOrder", () => {
    const found = negTests().some(
      e => (e.metadata as any)["testedOperation"] === "shipOrder",
    );
    expect(found).toBe(true);
  });

  it("has a negative test for payOrder", () => {
    const found = negTests().some(
      e => (e.metadata as any)["testedOperation"] === "payOrder",
    );
    expect(found).toBe(true);
  });

  it("has a negative test for cancelOrder", () => {
    const found = negTests().some(
      e => (e.metadata as any)["testedOperation"] === "cancelOrder",
    );
    expect(found).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

describe("Mercury analysis — determinism", () => {
  it("produces identical output on repeated runs", () => {
    const second = analyzeRepository({ repoRoot: MERCURY_ROOT });
    expect(JSON.stringify(second.evidence)).toBe(JSON.stringify(result.evidence));
    expect(JSON.stringify(second.transitions)).toBe(JSON.stringify(result.transitions));
  });
});
