import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  StateTransitionSchema,
  type StateTransition,
  type Witness,
} from "@nevergraph/schemas";
import { searchForbiddenState } from "@nevergraph/graph";
import {
  createWitness,
  generateRegressionTest,
  runGeneratedTest,
} from "../index.js";
import { createMercuryWitnessTestAdapter } from "../adapters/mercury.js";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(currentDirectory, "../../../..");
const transitionFile = path.join(workspaceRoot, ".nevergraph", "transitions.json");
const tempParent = path.resolve(currentDirectory, "../../.tmp-tests");
const temporaryDirectories: string[] = [];

let witness: Witness;

beforeAll(() => {
  const baseline = StateTransitionSchema.array().parse(
    JSON.parse(readFileSync(transitionFile, "utf8")),
  );
  const syntheticRestore: StateTransition = {
    id: "tr-test-restore",
    action: "restoreOrder",
    from: { state: "CANCELLED", facts: {} },
    to: { state: "PAID", facts: {} },
    file: "test-only/synthetic-restore.ts",
    line: 1,
    guards: [],
  };
  const result = searchForbiddenState({
    initialState: { state: "CREATED", facts: {} },
    transitions: [...baseline, syntheticRestore],
    forbiddenCondition: {
      targetState: "SHIPPED",
      requiredFacts: { refundedAt: true },
    },
  });

  witness = createWitness({
    identifier: "TEST-RULE-001",
    searchResult: result,
  });
});

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function createScenario(repaired: boolean): {
  cwd: string;
  generatedSource: string;
} {
  mkdirSync(tempParent, { recursive: true });
  const cwd = mkdtempSync(path.join(tempParent, repaired ? "repaired-" : "buggy-"));
  temporaryDirectories.push(cwd);

  writeFileSync(
    path.join(cwd, "vitest.config.ts"),
    'export default { test: { environment: "node", include: ["**/*.test.ts"] } };\n',
    "utf8",
  );
  writeFileSync(path.join(cwd, "scenario.ts"), scenarioSource(repaired), "utf8");

  const generated = generateRegressionTest({
    identifier: "TEST-RULE-001",
    witness,
    adapter: createMercuryWitnessTestAdapter({ moduleSpecifier: "./scenario.js" }),
    outputPath: path.join(cwd, "generated.test.ts"),
  });

  return { cwd, generatedSource: generated.source };
}

async function executeScenario(repaired: boolean) {
  const scenario = createScenario(repaired);
  const result = await runGeneratedTest({
    identifier: "TEST-RULE-001",
    cwd: scenario.cwd,
    testFile: "generated.test.ts",
    configFile: "vitest.config.ts",
  });
  return { ...scenario, result };
}

describe("isolated Mercury-like executable proof", () => {
  it("preserves the exact Phase 3 action path in the witness", () => {
    expect(witness.steps.map((step) => step.action)).toEqual([
      "payOrder",
      "refundOrder",
      "cancelOrder",
      "restoreOrder",
      "shipOrder",
    ]);
    expect(witness.steps.at(-1)!.toState.facts["refundedAt"]).toBe(true);
  });

  it("reports reproduced when the buggy fixture permits the forbidden path", async () => {
    const { generatedSource, result } = await executeScenario(false);

    expect(generatedSource).toContain("}).toThrow();");
    expect(generatedSource).not.toContain("toSucceed");
    expect(result.status).toBe("reproduced");
    expect(result.testResult).toBe("fail");
    expect(result.exitCode).toBe(1);
  });

  it("reports not_reproduced when the repaired fixture blocks the same logic", async () => {
    const buggy = createScenario(false);
    const repaired = await executeScenario(true);

    expect(repaired.generatedSource).toBe(buggy.generatedSource);
    expect(repaired.result.status).toBe("not_reproduced");
    expect(repaired.result.testResult).toBe("pass");
    expect(repaired.result.exitCode).toBe(0);
  });
});

function scenarioSource(repaired: boolean): string {
  const repairGuard = repaired
    ? '  if (order.refundedAt) throw new Error("historical refund blocks restoration");\n'
    : "";

  return [
    'type Status = "CREATED" | "PAID" | "REFUNDED" | "CANCELLED" | "SHIPPED";',
    "interface Order {",
    "  status: Status;",
    "  paidAt: boolean;",
    "  refundedAt: boolean;",
    "  cancelledAt: boolean;",
    "  shippedAt: boolean;",
    "}",
    "export function createOrder(): Order {",
    '  return { status: "CREATED", paidAt: false, refundedAt: false, cancelledAt: false, shippedAt: false };',
    "}",
    "export function payOrder(order: Order): void {",
    '  if (order.status !== "CREATED") throw new Error("invalid payment");',
    '  order.status = "PAID";',
    "  order.paidAt = true;",
    "}",
    "export function refundOrder(order: Order): void {",
    '  if (order.status !== "PAID") throw new Error("invalid refund");',
    '  order.status = "REFUNDED";',
    "  order.refundedAt = true;",
    "}",
    "export function cancelOrder(order: Order): void {",
    '  if (order.status !== "REFUNDED") throw new Error("invalid cancellation");',
    '  order.status = "CANCELLED";',
    "  order.cancelledAt = true;",
    "}",
    "export function restoreOrder(order: Order): void {",
    '  if (order.status !== "CANCELLED") throw new Error("invalid restoration");',
    repairGuard.trimEnd(),
    '  order.status = "PAID";',
    "}",
    "export function shipOrder(order: Order): void {",
    '  if (order.status !== "PAID") throw new Error("invalid shipment");',
    '  order.status = "SHIPPED";',
    "  order.shippedAt = true;",
    "}",
    "",
  ].filter((line) => line.length > 0).join("\n");
}
