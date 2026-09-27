import { mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import type { Witness } from "@nevergraph/schemas";
import {
  generateRegressionTest,
  type WitnessTestAdapter,
} from "../index.js";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const tempParent = path.resolve(currentDirectory, "../../.tmp-tests");
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function tempDirectory(): string {
  mkdirSync(tempParent, { recursive: true });
  const directory = mkdtempSync(path.join(tempParent, "generator-"));
  temporaryDirectories.push(directory);
  return directory;
}

const witness: Witness = {
  ruleId: "TEST-RULE-001",
  steps: [
    {
      action: "approveDocument",
      fromState: { state: "DRAFT", facts: {} },
      toState: { state: "APPROVED", facts: { approved: true } },
    },
    {
      action: "publishDocument",
      fromState: { state: "APPROVED", facts: { approved: true } },
      toState: {
        state: "PUBLISHED",
        facts: { approved: true, published: true },
      },
    },
  ],
  length: 2,
  isForbidden: true,
};

function fakeAdapter(received: string[][]): WitnessTestAdapter {
  return {
    id: "document-fixture",
    safetyAssertion: "path_must_throw",
    supports: () => true,
    generateTest: ({ identifier, witness: receivedWitness }) => {
      const actions = receivedWitness.steps.map((step) => step.action);
      received.push(actions);
      return [
        'import { describe, expect, it } from "vitest";',
        `describe(${JSON.stringify(identifier)}, () => {`,
        '  it("keeps the forbidden path blocked", () => {',
        "    expect(() => {",
        ...actions.map((action) => `      ${action}();`),
        "    }).toThrow();",
        "  });",
        "});",
      ].join("\n");
    },
  };
}

describe("generateRegressionTest", () => {
  it("passes ordered witness actions to the adapter", () => {
    const received: string[][] = [];
    generateRegressionTest({
      identifier: "TEST-RULE-001",
      witness,
      adapter: fakeAdapter(received),
    });

    expect(received).toEqual([["approveDocument", "publishDocument"]]);
  });

  it("produces byte-identical source for the same witness", () => {
    const adapter = fakeAdapter([]);
    const first = generateRegressionTest({
      identifier: "TEST-RULE-001",
      witness,
      adapter,
    });
    const second = generateRegressionTest({
      identifier: "TEST-RULE-001",
      witness,
      adapter,
    });

    expect(first.source).toBe(second.source);
    expect(first.source.endsWith("\n")).toBe(true);
  });

  it("generates a negative-specification safety assertion", () => {
    const result = generateRegressionTest({
      identifier: "TEST-RULE-001",
      witness,
      adapter: fakeAdapter([]),
    });

    expect(result.source).toContain("expect(() => {");
    expect(result.source).toContain("}).toThrow();");
    expect(result.source).not.toContain("toSucceed");
  });

  it("writes the same validated source when outputPath is supplied", () => {
    const directory = tempDirectory();
    const outputPath = path.join(directory, "generated.test.ts");
    const result = generateRegressionTest({
      identifier: "TEST-RULE-001",
      witness,
      adapter: fakeAdapter([]),
      outputPath,
    });

    expect(result.testFile).toBe(path.resolve(outputPath));
    expect(readFileSync(outputPath, "utf8")).toBe(result.source);
  });

  it("fails closed for unsupported, invalid, or empty adapters", () => {
    const unsupported: WitnessTestAdapter = {
      ...fakeAdapter([]),
      supports: () => false,
    };
    expect(() =>
      generateRegressionTest({
        identifier: "TEST-RULE-001",
        witness,
        adapter: unsupported,
      }),
    ).toThrow(/does not support/);

    const empty: WitnessTestAdapter = {
      ...fakeAdapter([]),
      generateTest: () => "",
    };
    expect(() =>
      generateRegressionTest({
        identifier: "TEST-RULE-001",
        witness,
        adapter: empty,
      }),
    ).toThrow(/empty test source/);

    expect(() =>
      generateRegressionTest({
        identifier: "DIFFERENT-ID",
        witness,
        adapter: fakeAdapter([]),
      }),
    ).toThrow(/must match/);
  });
});
