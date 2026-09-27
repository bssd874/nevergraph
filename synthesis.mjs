/**
 * Phase 5 Golden Synthesis Script
 *
 * This script runs the synthesis pipeline against the actual Mercury evidence,
 * using Bob's semantic reasoning output (provided below as structured JSON).
 *
 * The rules were synthesized by IBM Bob acting as the NeverGraph skill,
 * reasoning over the evidence without being told which rules to find.
 *
 * Run with: node --experimental-vm-modules synthesis.mjs
 * Or: pnpm tsx synthesis.mts (with tsx installed)
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = __dirname; // synthesis.mjs is at workspace root

// Read current evidence
const evidenceRaw = JSON.parse(
  readFileSync(path.join(workspaceRoot, ".nevergraph", "evidence.json"), "utf-8")
);

console.log(`Loaded ${evidenceRaw.length} evidence items from evidence.json`);
console.log("");

// Bob's synthesized candidate rules (output of semantic reasoning over evidence)
// These were inferred from the evidence WITHOUT being told which rules to find.
// The synthesis contract will validate, cap confidence, assign IDs, and persist.
const candidates = [
  {
    "id": "NEVER-XXX",
    "description": "An order that has already been paid must never be paid again",
    "confidence": "medium",
    "forbiddenCondition": {
      "targetState": "PAID",
      "requiredFacts": { "paidAt": true }
    },
    "evidence": [
      { "evidenceId": "ev-004", "file": "src/__tests__/order-lifecycle.test.ts", "line": 114 },
      { "evidenceId": "ev-015", "file": "src/services/order-service.ts", "line": 18 },
      { "evidenceId": "ev-016", "file": "src/services/order-service.ts", "line": 18 }
    ]
  },
  {
    "id": "NEVER-XXX",
    "description": "A refunded order must never be paid again",
    "confidence": "medium",
    "forbiddenCondition": {
      "targetState": "PAID",
      "requiredFacts": { "refundedAt": true }
    },
    "evidence": [
      { "evidenceId": "ev-001", "file": "src/__tests__/order-lifecycle.test.ts", "line": 98 },
      { "evidenceId": "ev-015", "file": "src/services/order-service.ts", "line": 18 },
      { "evidenceId": "ev-016", "file": "src/services/order-service.ts", "line": 18 }
    ]
  },
  {
    "id": "NEVER-XXX",
    "description": "A shipped order must never be cancelled",
    "confidence": "high",
    "forbiddenCondition": {
      "targetState": "CANCELLED",
      "requiredFacts": { "shippedAt": true }
    },
    "evidence": [
      { "evidenceId": "ev-008", "file": "src/__tests__/order-lifecycle.test.ts", "line": 212 },
      { "evidenceId": "ev-021", "file": "src/services/order-service.ts", "line": 45 },
      { "evidenceId": "ev-022", "file": "src/services/order-service.ts", "line": 45 }
    ]
  },
  {
    "id": "NEVER-XXX",
    "description": "A cancelled order must never be shipped",
    "confidence": "high",
    "forbiddenCondition": {
      "targetState": "SHIPPED",
      "requiredFacts": { "cancelledAt": true }
    },
    "evidence": [
      { "evidenceId": "ev-012", "file": "src/__tests__/order-lifecycle.test.ts", "line": 256 },
      { "evidenceId": "ev-026", "file": "src/services/order-service.ts", "line": 69 },
      { "evidenceId": "ev-027", "file": "src/services/order-service.ts", "line": 69 }
    ]
  },
  {
    "id": "NEVER-XXX",
    "description": "A refunded order must never be shipped",
    "confidence": "high",
    "forbiddenCondition": {
      "targetState": "SHIPPED",
      "requiredFacts": { "refundedAt": true }
    },
    "evidence": [
      { "evidenceId": "ev-013", "file": "src/__tests__/order-lifecycle.test.ts", "line": 262 },
      { "evidenceId": "ev-026", "file": "src/services/order-service.ts", "line": 69 },
      { "evidenceId": "ev-027", "file": "src/services/order-service.ts", "line": 69 }
    ]
  }
];

console.log(`Bob synthesized ${candidates.length} candidate rules.`);
console.log("Running synthesis pipeline (Zod validation + evidence-ref check + confidence policy)...");
console.log("");

// Dynamic import for the compiled MCP server persistence module
const persistenceUrl = pathToFileURL(
  path.join(workspaceRoot, "mcp/server/dist/persistence.js")
).href;
const { runSynthesisPipeline } = await import(persistenceUrl);

const { rules, errors } = runSynthesisPipeline(candidates, evidenceRaw, workspaceRoot);

if (errors.length > 0) {
  console.log("Validation errors:");
  for (const err of errors) {
    console.log(`  [Rule index ${err.ruleIndex}]: ${err.reason}`);
  }
}

console.log(`\nPersisted ${rules.length} validated rules to .nevergraph/rules.json:`);
for (const rule of rules) {
  console.log(`  ${rule.id}: "${rule.description}" (confidence: ${rule.confidence})`);
  console.log(`    forbiddenCondition: ${JSON.stringify(rule.forbiddenCondition)}`);
  console.log(`    evidence: [${rule.evidence.map(e => e.evidenceId).join(", ")}]`);
}
