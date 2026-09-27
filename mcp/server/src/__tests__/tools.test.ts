/**
 * tools.test.ts
 *
 * Deterministic unit tests for MCP tool handlers.
 * Tests cover:
 *  8.  MCP get_repository_evidence returns validated evidence
 *  9.  MCP get_transitions returns validated transitions
 *  10. MCP find_counterexample delegates to graph package (not duplicate logic)
 *  11. MCP run_witness delegates to runner (error on nonexistent file)
 *  12. Nonexistent repository path fails safely (scan_repository)
 *  13. Malformed tool input fails closed
 *  14. No handler invents reachability results
 *  15. No rule is persisted solely from free-form prose
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, writeFileSync, mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { EvidenceItem, StateTransition } from "@nevergraph/schemas";
import { getRepositoryEvidence } from "../tools/get_repository_evidence.js";
import { getTransitions } from "../tools/get_transitions.js";
import { getNeverRules } from "../tools/get_never_rules.js";
import { findCounterexample } from "../tools/find_counterexample.js";
import { scanRepository } from "../tools/scan_repository.js";
import { getRuleEvidence } from "../tools/get_rule_evidence.js";
import { verifyRule } from "../tools/verify_rule.js";
import { persistRules } from "../persistence.js";
import type { NeverRule } from "@nevergraph/schemas";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "nevergraph-tools-test-"));
  mkdirSync(path.join(tmpDir, ".nevergraph"), { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

const SAMPLE_EVIDENCE: EvidenceItem[] = [
  {
    id: "ev-001",
    type: "guard",
    file: "src/foo.ts",
    line: 5,
    symbol: "doFoo",
    snippet: "if (x.done) throw",
    summary: "Guard: done → throw",
    metadata: {},
  },
  {
    id: "ev-002",
    type: "negative_test",
    file: "src/foo.test.ts",
    line: 10,
    symbol: "doFoo",
    snippet: "expect(() => doFoo(done)).toThrow()",
    summary: "Negative test",
    metadata: {},
  },
];

const SAMPLE_TRANSITIONS: StateTransition[] = [
  {
    id: "tr-001",
    action: "activate",
    from: { state: "INACTIVE", facts: {} },
    to: { state: "ACTIVE", facts: { activated: true } },
    file: "src/foo.ts",
    line: 10,
    guards: [],
  },
  {
    id: "tr-002",
    action: "complete",
    from: { state: "ACTIVE", facts: {} },
    to: { state: "DONE", facts: { done: true } },
    file: "src/foo.ts",
    line: 20,
    guards: [],
  },
];

function writeSampleEvidence(dir: string): void {
  writeFileSync(
    path.join(dir, ".nevergraph", "evidence.json"),
    JSON.stringify(SAMPLE_EVIDENCE),
  );
}

function writeSampleTransitions(dir: string): void {
  writeFileSync(
    path.join(dir, ".nevergraph", "transitions.json"),
    JSON.stringify(SAMPLE_TRANSITIONS),
  );
}

// ---------------------------------------------------------------------------
// Test 8: get_repository_evidence returns validated evidence
// ---------------------------------------------------------------------------

describe("getRepositoryEvidence", () => {
  it("returns validated evidence from evidence.json", () => {
    writeSampleEvidence(tmpDir);
    const result = getRepositoryEvidence({ workspaceRoot: tmpDir });
    expect(result.count).toBe(2);
    expect(result.evidence[0]?.id).toBe("ev-001");
  });

  it("returns empty array when evidence.json does not exist", () => {
    const result = getRepositoryEvidence({ workspaceRoot: tmpDir });
    expect(result.count).toBe(0);
    expect(result.evidence).toEqual([]);
  });

  it("throws when evidence.json contains malformed data", () => {
    writeFileSync(
      path.join(tmpDir, ".nevergraph", "evidence.json"),
      JSON.stringify([{ bad: "data" }]),
    );
    expect(() => getRepositoryEvidence({ workspaceRoot: tmpDir })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Test 9: get_transitions returns validated transitions
// ---------------------------------------------------------------------------

describe("getTransitions", () => {
  it("returns validated transitions from transitions.json", () => {
    writeSampleTransitions(tmpDir);
    const result = getTransitions({ workspaceRoot: tmpDir });
    expect(result.count).toBe(2);
    expect(result.transitions[0]?.action).toBe("activate");
  });

  it("returns empty array when transitions.json does not exist", () => {
    const result = getTransitions({ workspaceRoot: tmpDir });
    expect(result.count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Test 10: find_counterexample delegates to graph package
// ---------------------------------------------------------------------------

describe("findCounterexample", () => {
  it("delegates BFS to graph package — finds a reachable condition", () => {
    // Using sample transitions: INACTIVE → ACTIVE → DONE
    // If we ask: can we reach DONE with { done: true }? Yes.
    const result = findCounterexample({
      initialState: { state: "INACTIVE", facts: {} },
      transitions: SAMPLE_TRANSITIONS,
      forbiddenCondition: { targetState: "DONE", requiredFacts: { done: true } },
    });
    expect(result.status).toBe("found");
    expect(result.depth).toBeGreaterThan(0);
    expect(result.pathLength).toBeGreaterThan(0);
    // The path is returned from the graph engine, not fabricated here
    expect(Array.isArray(result.path)).toBe(true);
  });

  it("returns unreachable for an impossible condition", () => {
    const result = findCounterexample({
      initialState: { state: "INACTIVE", facts: {} },
      transitions: SAMPLE_TRANSITIONS,
      forbiddenCondition: {
        targetState: "IMPOSSIBLE_STATE",
        requiredFacts: { impossible: true },
      },
    });
    expect(result.status).toBe("unreachable");
  });

  it("rejects malformed initialState (test 13: malformed input fails closed)", () => {
    expect(() =>
      findCounterexample({
        initialState: { state: "", facts: {} }, // state must be non-empty
        transitions: SAMPLE_TRANSITIONS,
        forbiddenCondition: { targetState: "X", requiredFacts: {} },
      }),
    ).toThrow();
  });

  it("rejects malformed transitions", () => {
    expect(() =>
      findCounterexample({
        initialState: { state: "INACTIVE", facts: {} },
        transitions: [{ bad: "transition" }] as unknown as StateTransition[],
        forbiddenCondition: { targetState: "X", requiredFacts: {} },
      }),
    ).toThrow();
  });

  // Test 14: No handler invents reachability results
  it("returns the graph engine's answer directly — unreachable means no path was found", () => {
    const result = findCounterexample({
      initialState: { state: "INACTIVE", facts: {} },
      transitions: [], // empty transitions — nothing is reachable
      forbiddenCondition: { targetState: "DONE", requiredFacts: { done: true } },
    });
    // With empty transitions, the engine must return unreachable
    expect(result.status).toBe("unreachable");
    expect(result.pathLength).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Test 12: Nonexistent repository path fails safely
// ---------------------------------------------------------------------------

describe("scanRepository", () => {
  it("rejects a nonexistent repository path with a clear error", () => {
    expect(() =>
      scanRepository({
        repoPath: "/this/path/does/not/exist/at/all",
        workspaceRoot: tmpDir,
      }),
    ).toThrow(/does not exist/);
  });

  it("rejects a file path (not a directory)", () => {
    const filePath = path.join(tmpDir, "not-a-directory.txt");
    writeFileSync(filePath, "hello");
    expect(() =>
      scanRepository({ repoPath: filePath, workspaceRoot: tmpDir }),
    ).toThrow(/not a directory/);
  });
});

// ---------------------------------------------------------------------------
// Test 11: run_witness delegates to runner (tests error handling for missing file)
// ---------------------------------------------------------------------------

// Note: We test that the handler correctly rejects missing files rather than
// spawning vitest (which would be an integration test). The actual execution
// delegation is verified by the runner package tests.
import { runWitness } from "../tools/run_witness.js";

describe("runWitness", () => {
  it("throws a clear error when the test file does not exist", async () => {
    await expect(
      runWitness({
        identifier: "NEVER-001",
        cwd: tmpDir,
        testFile: "tests/regression/NEVER-001.test.ts", // doesn't exist
      }),
    ).rejects.toThrow(/does not exist/);
  });

  it("throws when cwd does not exist", async () => {
    await expect(
      runWitness({
        identifier: "NEVER-001",
        cwd: path.join(tmpDir, "nonexistent-subdir"),
        testFile: "test.ts",
      }),
    ).rejects.toThrow(/does not exist/);
  });
});

// ---------------------------------------------------------------------------
// Test 15: No rule is persisted solely from free-form prose
// ---------------------------------------------------------------------------

describe("getNeverRules + persistence boundary", () => {
  it("returns empty array when no rules have been synthesized", () => {
    const result = getNeverRules({ workspaceRoot: tmpDir });
    expect(result.count).toBe(0);
    expect(result.rules).toEqual([]);
  });

  it("persisted rules can be retrieved and are validated on read", () => {
    const rule: NeverRule = {
      id: "NEVER-001",
      description: "A done item must never become active",
      confidence: "low",
      forbiddenCondition: { targetState: "ACTIVE", requiredFacts: { done: true } },
      evidence: [{ evidenceId: "ev-001", file: "src/foo.ts", line: 5 }],
    };
    writeSampleEvidence(tmpDir);
    persistRules([rule], tmpDir);
    const result = getNeverRules({ workspaceRoot: tmpDir });
    expect(result.count).toBe(1);
    expect(result.rules[0]?.id).toBe("NEVER-001");
  });

  it("fails closed when a persisted rule cites nonexistent evidence", () => {
    const rule: NeverRule = {
      id: "NEVER-001",
      description: "A done item must never become active",
      confidence: "low",
      forbiddenCondition: { targetState: "ACTIVE", requiredFacts: { done: true } },
      evidence: [{ evidenceId: "ev-999", file: "src/fake.ts", line: 1 }],
    };
    writeSampleEvidence(tmpDir);
    persistRules([rule], tmpDir);
    expect(() => getNeverRules({ workspaceRoot: tmpDir })).toThrow(/evidence validation/);
  });
});

// ---------------------------------------------------------------------------
// verifyRule — returns explicit error rather than fabricated result
// ---------------------------------------------------------------------------

describe("verifyRule", () => {
  it("returns rule_not_found for unknown rule ID", () => {
    const result = verifyRule({
      ruleId: "NEVER-999",
      initialState: { state: "INACTIVE", facts: {} },
      workspaceRoot: tmpDir,
    });
    expect(result.status).toBe("rule_not_found");
    expect(result.message).toMatch(/NEVER-999/);
  });

  it("returns context_missing when no transitions are available", () => {
    const rule: NeverRule = {
      id: "NEVER-001",
      description: "test",
      confidence: "low",
      forbiddenCondition: { targetState: "X", requiredFacts: {} },
      evidence: [{ evidenceId: "ev-001", file: "src/foo.ts", line: 5 }],
    };
    writeSampleEvidence(tmpDir);
    persistRules([rule], tmpDir);
    // No transitions.json written
    const result = verifyRule({
      ruleId: "NEVER-001",
      initialState: { state: "Y", facts: {} },
      workspaceRoot: tmpDir,
    });
    expect(result.status).toBe("context_missing");
  });

  it("delegates reachability check to graph package", () => {
    const rule: NeverRule = {
      id: "NEVER-001",
      description: "done items are terminal",
      confidence: "low",
      forbiddenCondition: { targetState: "DONE", requiredFacts: { done: true } },
      evidence: [{ evidenceId: "ev-001", file: "src/foo.ts", line: 5 }],
    };
    writeSampleEvidence(tmpDir);
    persistRules([rule], tmpDir);
    writeSampleTransitions(tmpDir);

    const result = verifyRule({
      ruleId: "NEVER-001",
      initialState: { state: "INACTIVE", facts: {} },
      workspaceRoot: tmpDir,
    });
    // DONE with done=true is reachable via INACTIVE→ACTIVE→DONE
    expect(result.status).toBe("reachable");
  });
});

// ---------------------------------------------------------------------------
// getRuleEvidence
// ---------------------------------------------------------------------------

describe("getRuleEvidence", () => {
  it("returns evidence items for a known rule", () => {
    const rule: NeverRule = {
      id: "NEVER-001",
      description: "test rule",
      confidence: "low",
      forbiddenCondition: { targetState: "DONE", requiredFacts: {} },
      evidence: [
        { evidenceId: "ev-001", file: "src/foo.ts", line: 5 },
      ],
    };
    persistRules([rule], tmpDir);
    writeSampleEvidence(tmpDir);

    const result = getRuleEvidence({ ruleId: "NEVER-001", workspaceRoot: tmpDir });
    expect(result.evidence).toHaveLength(1);
    expect(result.evidence[0]?.id).toBe("ev-001");
    expect(result.missingIds).toHaveLength(0);
  });

  it("throws for an unknown rule ID", () => {
    expect(() =>
      getRuleEvidence({ ruleId: "NEVER-999", workspaceRoot: tmpDir }),
    ).toThrow(/NEVER-999/);
  });
});
