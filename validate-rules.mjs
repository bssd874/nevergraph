import { pathToFileURL } from "node:url";
import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Use the persistence module from the compiled MCP server which re-uses Zod internally
const persistenceUrl = pathToFileURL(path.resolve(__dirname, "mcp/server/dist/persistence.js")).href;
const { readValidatedRules } = await import(persistenceUrl);

try {
  const rules = readValidatedRules(__dirname);
  console.log(
    `PASS: rules.json is valid -- ${rules.length} rules pass NeverRuleSchema, ` +
    "evidence-reference validation, confidence policy, and deterministic ID validation",
  );
  for (const rule of rules) {
    console.log(`  ${rule.id}: "${rule.description}" (${rule.confidence})`);
    console.log(`    forbiddenCondition: ${JSON.stringify(rule.forbiddenCondition)}`);
    console.log(`    evidence refs: [${rule.evidence.map(e => e.evidenceId).join(", ")}]`);
  }
} catch (err) {
  console.error("FAIL: Validation failed:", err.message);
  process.exit(1);
}
