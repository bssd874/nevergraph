import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import type { StateTransition, Witness } from "@nevergraph/schemas";
import type { SearchResult } from "@nevergraph/graph";
import {
  createWitness,
  persistProofExecution,
  persistWitness,
  serializeProofExecution,
  serializeWitness,
  type ProofExecutionResult,
} from "../index.js";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const tempParent = path.resolve(currentDirectory, "../../.tmp-tests");
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function makeTempDirectory(): string {
  mkdirSync(tempParent, { recursive: true });
  const directory = mkdtempSync(path.join(tempParent, "witness-"));
  temporaryDirectories.push(directory);
  return directory;
}

const review: StateTransition = {
  id: "tr-review",
  action: "reviewRecord",
  from: { state: "DRAFT", facts: {} },
  to: { state: "REVIEWED", facts: { reviewed: true } },
  file: "fixtures/records.ts",
  line: 10,
  guards: [],
};

const publish: StateTransition = {
  id: "tr-publish",
  action: "publishRecord",
  from: { state: "REVIEWED", facts: { reviewed: true } },
  to: { state: "PUBLISHED", facts: { public: true } },
  file: "fixtures/records.ts",
  line: 20,
  guards: [],
};

function foundResult(): SearchResult {
  return {
    status: "found",
    initialState: { state: "DRAFT", facts: { priority: "normal" } },
    finalState: {
      state: "PUBLISHED",
      facts: { priority: "normal", public: true, reviewed: true },
    },
    path: [review, publish],
    depth: 2,
    exploredStateCount: 3,
    limits: { maxDepth: 10, maxVisitedStates: 100 },
    graph: { nodes: [], edges: [] },
  };
}

describe("createWitness", () => {
  it("converts a found path into ordered WitnessStep entries", () => {
    const witness = createWitness({
      identifier: "TEST-RULE-001",
      searchResult: foundResult(),
    });

    expect(witness.steps.map((step) => step.action)).toEqual([
      "reviewRecord",
      "publishRecord",
    ]);
    expect(witness.length).toBe(2);
    expect(witness.isForbidden).toBe(true);
  });

  it("preserves the initial state in the first step", () => {
    const witness = createWitness({
      identifier: "TEST-RULE-001",
      searchResult: foundResult(),
    });

    expect(witness.steps[0]!.fromState).toEqual({
      state: "DRAFT",
      facts: { priority: "normal" },
    });
  });

  it("preserves the final state and historical facts in the last step", () => {
    const witness = createWitness({
      identifier: "TEST-RULE-001",
      searchResult: foundResult(),
    });

    expect(witness.steps.at(-1)!.toState).toEqual({
      state: "PUBLISHED",
      facts: { priority: "normal", public: true, reviewed: true },
    });
  });

  it("rejects non-found and empty found results safely", () => {
    const unreachable: SearchResult = {
      status: "unreachable",
      initialState: { state: "DRAFT", facts: {} },
      finalState: null,
      path: [],
      depth: null,
      exploredStateCount: 1,
      limits: { maxDepth: 10, maxVisitedStates: 100 },
      graph: { nodes: [], edges: [] },
    };
    expect(() =>
      createWitness({ identifier: "TEST-RULE-001", searchResult: unreachable }),
    ).toThrow(/found search result/);

    const emptyFound: SearchResult = {
      status: "found",
      initialState: { state: "BLOCKED", facts: {} },
      finalState: { state: "BLOCKED", facts: {} },
      path: [],
      depth: 0,
      exploredStateCount: 1,
      limits: { maxDepth: 10, maxVisitedStates: 100 },
      graph: { nodes: [], edges: [] },
    };
    expect(() =>
      createWitness({ identifier: "TEST-RULE-001", searchResult: emptyFound }),
    ).toThrow(/empty transition path/);
  });

  it("rejects inconsistent depth and final-state data", () => {
    const wrongDepth = { ...foundResult(), depth: 3 } as SearchResult;
    expect(() =>
      createWitness({ identifier: "TEST-RULE-001", searchResult: wrongDepth }),
    ).toThrow(/depth/);

    const base = foundResult();
    const wrongFinal = {
      ...base,
      finalState: { state: "OTHER", facts: {} },
    } as SearchResult;
    expect(() =>
      createWitness({ identifier: "TEST-RULE-001", searchResult: wrongFinal }),
    ).toThrow(/final state/);
  });
});

describe("witness serialization and persistence", () => {
  it("serializes equivalent fact insertion orders byte-identically", () => {
    const first = createWitness({
      identifier: "TEST-RULE-001",
      searchResult: foundResult(),
    });
    const second: Witness = {
      ...first,
      steps: first.steps.map((step) => ({
        action: step.action,
        fromState: {
          state: step.fromState.state,
          facts: Object.fromEntries(Object.entries(step.fromState.facts).reverse()),
        },
        toState: {
          state: step.toState.state,
          facts: Object.fromEntries(Object.entries(step.toState.facts).reverse()),
        },
      })),
    };

    expect(serializeWitness(first)).toBe(serializeWitness(second));
    expect(serializeWitness(first)).not.toContain("timestamp");
  });

  it("validates against WitnessSchema before persistence", () => {
    const directory = makeTempDirectory();
    const outputPath = path.join(directory, "invalid.json");
    const invalid = {
      ruleId: "TEST-RULE-001",
      steps: [],
      length: 0,
      isForbidden: true,
    } as unknown as Witness;

    expect(() => persistWitness(invalid, outputPath)).toThrow();
    expect(existsSync(outputPath)).toBe(false);
  });

  it("persists the exact deterministic serialization", () => {
    const directory = makeTempDirectory();
    const outputPath = path.join(directory, "witness.json");
    const witness = createWitness({
      identifier: "TEST-RULE-001",
      searchResult: foundResult(),
    });

    const persistedPath = persistWitness(witness, outputPath);
    expect(readFileSync(persistedPath, "utf8")).toBe(serializeWitness(witness));
  });
});

describe("Phase 4 proof execution artifacts", () => {
  const proofResult: ProofExecutionResult = {
    identifier: "TEST-RULE-001",
    testFile: "D:/workspace/.nevergraph/generated-tests/TEST-RULE-001.test.ts",
    cwd: "D:/workspace",
    command: ["node", "vitest.mjs", "run", "generated.test.ts"],
    exitCode: 1,
    signal: null,
    status: "reproduced",
    testResult: "fail",
    stdout: '{"numFailedTests":1}',
    stderr: "",
    stdoutSummary: '{"numFailedTests":1}',
    stderrSummary: "",
    timedOut: false,
  };

  it("serializes truthfully without later repair or timestamp fields", () => {
    const serialized = serializeProofExecution(proofResult);

    expect(serialized).toContain('"status": "reproduced"');
    expect(serialized).not.toContain("repairApplied");
    expect(serialized).not.toContain("verificationResult");
    expect(serialized).not.toContain("timestamp");
  });

  it("persists a deterministic proof execution result on explicit request", () => {
    const directory = makeTempDirectory();
    const outputPath = path.join(directory, "execution.json");
    const persistedPath = persistProofExecution(proofResult, outputPath);

    expect(readFileSync(persistedPath, "utf8")).toBe(
      serializeProofExecution(proofResult),
    );
  });
});
