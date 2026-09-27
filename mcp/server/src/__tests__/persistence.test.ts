/**
 * persistence.test.ts
 *
 * Deterministic unit tests for the synthesis validation pipeline.
 * Tests that the pipeline correctly:
 *  1. accepts valid synthesized rules
 *  2. rejects malformed Bob output
 *  3. rejects hallucinated evidence IDs
 *  4. caps confidence based on evidence-category count
 *  5. assigns stable deterministic IDs
 *  6. validates before write (persistence gate)
 *  7. rejects malformed rules.json on read
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, writeFileSync, mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { EvidenceItem, NeverRule } from "@nevergraph/schemas";
import {
  validateSynthesizedRules,
  assignRuleIds,
  persistRules,
  readRules,
  readValidatedRules,
  readEvidence,
  readTransitions,
  runSynthesisPipeline,
} from "../persistence.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_EVIDENCE: EvidenceItem[] = [
  {
    id: "ev-001",
    type: "guard",
    file: "src/services/foo.service.ts",
    line: 10,
    symbol: "doFoo",
    snippet: "if (x.done) throw new Error()",
    summary: "Guard in doFoo: done=true → throw",
    metadata: {},
  },
  {
    id: "ev-002",
    type: "negative_test",
    file: "src/__tests__/foo.test.ts",
    line: 42,
    symbol: "doFoo",
    snippet: "expect(() => doFoo(doneObj)).toThrow()",
    summary: "Negative test: doFoo throws when done=true",
    metadata: {},
  },
  {
    id: "ev-003",
    type: "comment",
    file: "src/services/foo.service.ts",
    line: 9,
    symbol: "doFoo",
    snippet: "// Done items are terminal",
    summary: "Terminal comment in doFoo",
    metadata: {},
  },
  {
    id: "ev-004",
    type: "throw",
    file: "src/services/bar.service.ts",
    line: 20,
    symbol: "doBar",
    snippet: "throw new Error()",
    summary: "doBar throws on invalid state",
    metadata: {},
  },
];

function validRule(overrides: Partial<NeverRule> = {}): NeverRule {
  return {
    id: "NEVER-XXX",
    description: "A done item must never be re-activated",
    confidence: "medium",
    forbiddenCondition: {
      targetState: "ACTIVE",
      requiredFacts: { done: true },
    },
    evidence: [
      { evidenceId: "ev-001", file: "src/services/foo.service.ts", line: 10 },
      { evidenceId: "ev-002", file: "src/__tests__/foo.test.ts", line: 42 },
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test 1: Valid NeverRule accepted
// ---------------------------------------------------------------------------

describe("validateSynthesizedRules", () => {
  it("accepts a valid candidate with real evidence IDs", () => {
    const { valid, errors } = validateSynthesizedRules([validRule()], MOCK_EVIDENCE);
    expect(valid).toHaveLength(1);
    expect(errors).toHaveLength(0);
  });

  // Test 2: Malformed Bob output rejected
  it("rejects non-array input", () => {
    const { valid, errors } = validateSynthesizedRules({ not: "an array" }, MOCK_EVIDENCE);
    expect(valid).toHaveLength(0);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]?.reason).toMatch(/JSON array/);
  });

  it("rejects a rule missing required fields", () => {
    const { valid, errors } = validateSynthesizedRules(
      [{ id: "NEVER-001", confidence: "high" }],
      MOCK_EVIDENCE,
    );
    expect(valid).toHaveLength(0);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]?.reason).toMatch(/Zod/);
  });

  it("rejects a rule with empty evidence array", () => {
    const { valid, errors } = validateSynthesizedRules(
      [validRule({ evidence: [] as unknown as NeverRule["evidence"] })],
      MOCK_EVIDENCE,
    );
    expect(valid).toHaveLength(0);
    expect(errors[0]?.reason).toMatch(/Zod/);
  });

  // Test 3: Hallucinated evidence ID rejected
  it("rejects a rule with a hallucinated evidence ID", () => {
    const { valid, errors } = validateSynthesizedRules(
      [
        validRule({
          evidence: [
            { evidenceId: "ev-999-HALLUCINATED", file: "fake.ts", line: 1 },
            { evidenceId: "ev-001", file: "src/services/foo.service.ts", line: 10 },
          ],
        }),
      ],
      MOCK_EVIDENCE,
    );
    expect(valid).toHaveLength(0);
    expect(errors[0]?.reason).toMatch(/hallucinated/);
    expect(errors[0]?.reason).toMatch(/ev-999-HALLUCINATED/);
  });

  it("rejects an evidence reference whose file or line does not match its ID", () => {
    const { valid, errors } = validateSynthesizedRules(
      [
        validRule({
          evidence: [
            { evidenceId: "ev-001", file: "src/wrong.ts", line: 999 },
          ],
        }),
      ],
      MOCK_EVIDENCE,
    );
    expect(valid).toHaveLength(0);
    expect(errors[0]?.reason).toMatch(/location mismatch/);
  });

  it("rejects malformed evidence context before trusting candidates", () => {
    const malformed = [{ id: "ev-001" }] as unknown as EvidenceItem[];
    const { valid, errors } = validateSynthesizedRules([validRule()], malformed);
    expect(valid).toHaveLength(0);
    expect(errors[0]?.reason).toMatch(/evidence validation failed/);
  });

  // Test 4: Confidence capping
  it("caps HIGH confidence to MEDIUM when only 2 evidence categories", () => {
    const { valid } = validateSynthesizedRules(
      [validRule({ confidence: "high" })], // ev-001=guard, ev-002=negative_test → 2 categories
      MOCK_EVIDENCE,
    );
    expect(valid).toHaveLength(1);
    expect(valid[0]?.confidence).toBe("medium");
  });

  it("allows HIGH confidence with 3 evidence categories", () => {
    const { valid } = validateSynthesizedRules(
      [
        validRule({
          confidence: "high",
          evidence: [
            { evidenceId: "ev-001", file: "src/services/foo.service.ts", line: 10 },
            { evidenceId: "ev-002", file: "src/__tests__/foo.test.ts", line: 42 },
            { evidenceId: "ev-003", file: "src/services/foo.service.ts", line: 9 },
          ],
        }),
      ],
      MOCK_EVIDENCE,
    );
    expect(valid).toHaveLength(1);
    expect(valid[0]?.confidence).toBe("high");
  });

  it("forces LOW confidence for a single evidence category", () => {
    const { valid } = validateSynthesizedRules(
      [
        validRule({
          confidence: "high",
          evidence: [
            { evidenceId: "ev-001", file: "src/services/foo.service.ts", line: 10 },
          ],
        }),
      ],
      MOCK_EVIDENCE,
    );
    expect(valid).toHaveLength(1);
    expect(valid[0]?.confidence).toBe("low");
  });

  it("rejects a rule that has no prose — free-form prose alone cannot produce a rule", () => {
    // A rule with no evidence whatsoever (empty evidence array fails Zod min(1))
    const { valid, errors } = validateSynthesizedRules(
      [
        {
          id: "NEVER-XXX",
          description: "something vague",
          confidence: "low",
          forbiddenCondition: { targetState: "X", requiredFacts: {} },
          evidence: [],
        },
      ],
      MOCK_EVIDENCE,
    );
    expect(valid).toHaveLength(0);
    expect(errors.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Test 5: Deterministic rule ID assignment
// ---------------------------------------------------------------------------

describe("assignRuleIds", () => {
  it("assigns NEVER-001, NEVER-002 in deterministic order", () => {
    const r1: NeverRule = {
      id: "NEVER-XXX",
      description: "zebra state must never be reached when done",
      confidence: "low",
      forbiddenCondition: { targetState: "ZEBRA", requiredFacts: { done: true } },
      evidence: [{ evidenceId: "ev-001", file: "src/foo.ts", line: 1 }],
    };
    const r2: NeverRule = {
      id: "NEVER-YYY",
      description: "apple state must never be reached when done",
      confidence: "low",
      forbiddenCondition: { targetState: "APPLE", requiredFacts: { done: true } },
      evidence: [{ evidenceId: "ev-002", file: "src/bar.ts", line: 2 }],
    };

    // Run twice — results must be identical
    const result1 = assignRuleIds([r1, r2]);
    const result2 = assignRuleIds([r2, r1]); // different input order

    expect(result1.map((r) => r.id)).toEqual(["NEVER-001", "NEVER-002"]);
    expect(result2.map((r) => r.id)).toEqual(result1.map((r) => r.id));
    expect(result1.map((r) => r.forbiddenCondition.targetState)).toEqual(
      result2.map((r) => r.forbiddenCondition.targetState),
    );
  });

  it("assigns stable IDs regardless of input order", () => {
    const rules = [
      validRule({ description: "X must never be reached when z" }),
      validRule({
        description: "Y must never be reached when z",
        forbiddenCondition: { targetState: "ACTIVE2", requiredFacts: { done: true } },
      }),
    ];
    const forward = assignRuleIds(rules);
    const reversed = assignRuleIds([...rules].reverse());
    expect(forward.map((r) => r.id)).toEqual(reversed.map((r) => r.id));
  });

  it("uses a canonical tie-breaker when normalized primary keys collide", () => {
    const alphaBeta = validRule({ description: "alpha beta" });
    const betaAlpha = validRule({
      description: "beta alpha",
      evidence: [
        { evidenceId: "ev-003", file: "src/services/foo.service.ts", line: 9 },
      ],
    });

    const forward = assignRuleIds([alphaBeta, betaAlpha]);
    const reversed = assignRuleIds([betaAlpha, alphaBeta]);
    const idsByDescription = (rules: NeverRule[]) => Object.fromEntries(
      rules.map((rule) => [rule.description, rule.id]),
    );

    expect(idsByDescription(forward)).toEqual(idsByDescription(reversed));
  });
});

// ---------------------------------------------------------------------------
// Test 6 & 7: Persistence validates before write / rejects malformed on read
// ---------------------------------------------------------------------------

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "nevergraph-test-"));
  mkdirSync(path.join(tmpDir, ".nevergraph"), { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("persistRules / readRules", () => {
  it("roundtrips a valid rule through persist + read", () => {
    const rule = validRule({ id: "NEVER-001" });
    persistRules([rule], tmpDir);
    const read = readRules(tmpDir);
    expect(read).toHaveLength(1);
    expect(read[0]?.id).toBe("NEVER-001");
  });

  it("throws when persisting an invalid rule (missing required field)", () => {
    const badRule = { id: "NEVER-001" }; // missing fields
    expect(() => persistRules([badRule as unknown as NeverRule], tmpDir)).toThrow();
  });

  it("throws when reading a rules.json that contains malformed data", () => {
    writeFileSync(
      path.join(tmpDir, ".nevergraph", "rules.json"),
      JSON.stringify([{ not: "a real rule" }]),
    );
    expect(() => readRules(tmpDir)).toThrow();
  });

  it("returns empty array when rules.json does not exist", () => {
    // No file created — should return []
    const rules = readRules(path.join(tmpDir, "nonexistent-workspace"));
    expect(rules).toEqual([]);
  });

  it("strictly reads a rule only when its evidence, confidence, and ID are valid", () => {
    writeFileSync(
      path.join(tmpDir, ".nevergraph", "evidence.json"),
      JSON.stringify(MOCK_EVIDENCE),
    );
    persistRules([validRule({ id: "NEVER-001" })], tmpDir);
    expect(readValidatedRules(tmpDir)).toHaveLength(1);
  });

  it("rejects a schema-valid persisted rule with a hallucinated evidence ID", () => {
    writeFileSync(
      path.join(tmpDir, ".nevergraph", "evidence.json"),
      JSON.stringify(MOCK_EVIDENCE),
    );
    persistRules([
      validRule({
        id: "NEVER-001",
        evidence: [{ evidenceId: "ev-999", file: "src/fake.ts", line: 1 }],
      }),
    ], tmpDir);
    expect(() => readValidatedRules(tmpDir)).toThrow(/evidence validation/);
  });

  it("rejects persisted confidence above the evidence-category cap", () => {
    writeFileSync(
      path.join(tmpDir, ".nevergraph", "evidence.json"),
      JSON.stringify(MOCK_EVIDENCE),
    );
    persistRules([validRule({ id: "NEVER-001", confidence: "high" })], tmpDir);
    expect(() => readValidatedRules(tmpDir)).toThrow(/confidence policy/);
  });

  it("rejects persisted IDs that do not match deterministic assignment", () => {
    writeFileSync(
      path.join(tmpDir, ".nevergraph", "evidence.json"),
      JSON.stringify(MOCK_EVIDENCE),
    );
    persistRules([validRule({ id: "NEVER-900" })], tmpDir);
    expect(() => readValidatedRules(tmpDir)).toThrow(/deterministic assignment/);
  });
});

describe("readEvidence", () => {
  it("throws when evidence.json contains malformed data", () => {
    writeFileSync(
      path.join(tmpDir, ".nevergraph", "evidence.json"),
      JSON.stringify([{ bad: "data" }]),
    );
    expect(() => readEvidence(tmpDir)).toThrow();
  });

  it("returns empty array when evidence.json does not exist", () => {
    const ev = readEvidence(path.join(tmpDir, "nonexistent-workspace"));
    expect(ev).toEqual([]);
  });
});

describe("readTransitions", () => {
  it("throws when transitions.json contains malformed data", () => {
    writeFileSync(
      path.join(tmpDir, ".nevergraph", "transitions.json"),
      JSON.stringify([{ bad: "data" }]),
    );
    expect(() => readTransitions(tmpDir)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Full pipeline
// ---------------------------------------------------------------------------

describe("runSynthesisPipeline", () => {
  it("persists valid candidates and returns them", () => {
    const evidence: EvidenceItem[] = [
      {
        id: "ev-001",
        type: "guard",
        file: "src/s.ts",
        line: 5,
        symbol: "fn",
        snippet: "if (x.done) throw",
        summary: "guard",
        metadata: {},
      },
      {
        id: "ev-002",
        type: "negative_test",
        file: "src/s.test.ts",
        line: 10,
        symbol: "fn",
        snippet: "expect(() => fn()).toThrow()",
        summary: "negative test",
        metadata: {},
      },
    ];

    // Write evidence to tmpDir so pipeline can read it
    writeFileSync(
      path.join(tmpDir, ".nevergraph", "evidence.json"),
      JSON.stringify(evidence),
    );

    const candidates = [
      {
        id: "NEVER-XXX",
        description: "A done item must never become active",
        confidence: "medium",
        forbiddenCondition: { targetState: "ACTIVE", requiredFacts: { done: true } },
        evidence: [
          { evidenceId: "ev-001", file: "src/s.ts", line: 5 },
          { evidenceId: "ev-002", file: "src/s.test.ts", line: 10 },
        ],
      },
    ];

    const { rules, errors } = runSynthesisPipeline(candidates, evidence, tmpDir);
    expect(errors).toHaveLength(0);
    expect(rules).toHaveLength(1);
    expect(rules[0]?.id).toBe("NEVER-001");

    // Should be persisted
    const persisted = readRules(tmpDir);
    expect(persisted).toHaveLength(1);
    expect(persisted[0]?.id).toBe("NEVER-001");
  });

  it("returns errors and does not persist when all candidates are invalid", () => {
    const { rules, errors } = runSynthesisPipeline([{ bad: "data" }], [], tmpDir);
    expect(rules).toHaveLength(0);
    expect(errors.length).toBeGreaterThan(0);
    // rules.json should remain empty
    const persisted = readRules(tmpDir);
    expect(persisted).toEqual([]);
  });
});
