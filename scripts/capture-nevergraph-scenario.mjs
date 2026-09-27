#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  EvidenceItemSchema,
  GraphStateSchema,
  NeverRuleSchema,
  StateTransitionSchema,
  WitnessSchema,
} from "../packages/schemas/dist/index.js";
import { searchForbiddenState } from "../packages/graph/dist/index.js";

const workspaceRoot = path.resolve(import.meta.dirname, "..");
const options = parseArguments(process.argv.slice(2));
const initialState = GraphStateSchema.parse(JSON.parse(options.initialState));
const rules = NeverRuleSchema.array().parse(readJson(".nevergraph/rules.json"));
const evidence = EvidenceItemSchema.array().parse(readJson(".nevergraph/evidence.json"));
const transitionSource = readJson(
  options.transitions ?? ".nevergraph/transitions.json",
);
const transitions = StateTransitionSchema.array().parse(
  Array.isArray(transitionSource) ? transitionSource : transitionSource.transitions,
);
const rule = rules.find((candidate) => candidate.id === options.ruleId);

if (!rule) throw new Error(`rule not found: ${options.ruleId}`);

const search = searchForbiddenState({
  initialState,
  transitions,
  forbiddenCondition: rule.forbiddenCondition,
});

if (options.expectedStatus !== undefined && search.status !== options.expectedStatus) {
  throw new Error(
    `expected search status ${options.expectedStatus}, received ${search.status}`,
  );
}

const witness = options.witness === undefined
  ? null
  : WitnessSchema.parse(readJson(options.witness));
const proof = options.proof === undefined ? null : proofSummary(readJson(options.proof));
const evidenceById = new Map(evidence.map((item) => [item.id, item]));
const selectedEvidence = rule.evidence.map((reference) => {
  const item = evidenceById.get(reference.evidenceId);
  if (!item) throw new Error(`rule references missing evidence: ${reference.evidenceId}`);
  return item;
});

const snapshot = {
  schemaVersion: 1,
  scenario: options.scenario,
  selectedRule: rule,
  evidence: selectedEvidence,
  initialState: search.initialState,
  transitions,
  search: {
    status: search.status,
    finalState: search.finalState,
    path: search.path,
    depth: search.depth,
    exploredStateCount: search.exploredStateCount,
    limits: search.limits,
    ...(search.status === "limit_reached"
      ? { limitReason: search.limitReason }
      : {}),
  },
  graph: {
    nodes: search.graph.nodes.map((node) => ({
      ...node,
      graphState: GraphStateSchema.parse(JSON.parse(node.id)),
    })),
    edges: search.graph.edges,
  },
  witness,
  proof,
};

const outputPath = resolveWorkspacePath(options.output);
mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(canonicalize(snapshot), null, 2)}\n`, "utf8");

console.log(
  JSON.stringify({
    outputPath: path.relative(workspaceRoot, outputPath).replaceAll("\\", "/"),
    scenario: options.scenario,
    ruleId: rule.id,
    searchStatus: search.status,
    depth: search.depth,
    exploredStateCount: search.exploredStateCount,
    proofStatus: proof?.status ?? null,
  }),
);

function parseArguments(args) {
  const values = new Map();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error("arguments must be supplied as --name value pairs");
    }
    values.set(key.slice(2), value);
  }

  for (const required of ["scenario", "rule", "initial-state", "output"]) {
    if (!values.has(required)) throw new Error(`missing --${required}`);
  }

  const expectedStatus = values.get("expected-status");
  if (
    expectedStatus !== undefined &&
    !["found", "unreachable", "limit_reached"].includes(expectedStatus)
  ) {
    throw new Error(`invalid --expected-status: ${expectedStatus}`);
  }

  return {
    scenario: values.get("scenario"),
    ruleId: values.get("rule"),
    initialState: values.get("initial-state"),
    output: values.get("output"),
    expectedStatus,
    witness: values.get("witness"),
    proof: values.get("proof"),
    transitions: values.get("transitions"),
  };
}

function readJson(filePath) {
  return JSON.parse(readFileSync(resolveWorkspacePath(filePath), "utf8"));
}

function resolveWorkspacePath(filePath) {
  const resolved = path.resolve(workspaceRoot, filePath);
  const relative = path.relative(workspaceRoot, resolved);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`path must resolve inside the workspace: ${filePath}`);
  }
  return resolved;
}

function proofSummary(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("proof artifact must be an object");
  }
  if (!['reproduced', 'not_reproduced', 'execution_error'].includes(value.status)) {
    throw new Error("proof artifact has an invalid status");
  }
  if (!['pass', 'fail', 'error'].includes(value.testResult)) {
    throw new Error("proof artifact has an invalid testResult");
  }

  return {
    identifier: value.identifier,
    status: value.status,
    testResult: value.testResult,
    exitCode: value.exitCode,
    timedOut: value.timedOut,
    testFile: path
      .relative(workspaceRoot, path.resolve(value.testFile))
      .replaceAll("\\", "/"),
  };
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort(compareStrings)
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

function compareStrings(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
