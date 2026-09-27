import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { WitnessSchema } from "@nevergraph/schemas";
import { validateArtifactIdentifier } from "./artifacts.js";
import type {
  GenerateRegressionTestInput,
  GeneratedRegressionTest,
} from "./types.js";

/** Generate and optionally persist a deterministic adapter-backed Vitest test. */
export function generateRegressionTest(
  input: GenerateRegressionTestInput,
): GeneratedRegressionTest {
  const identifier = validateArtifactIdentifier(input.identifier);
  const witness = WitnessSchema.parse(input.witness);

  if (witness.ruleId !== identifier) {
    throw new Error("identifier must match witness.ruleId");
  }
  if (input.adapter.id.trim().length === 0) {
    throw new Error("adapter id must be non-empty");
  }
  if (input.adapter.safetyAssertion !== "path_must_throw") {
    throw new Error("adapter must generate a path-must-throw safety assertion");
  }
  if (!input.adapter.supports(witness)) {
    throw new Error(`adapter ${input.adapter.id} does not support this witness`);
  }

  const generated = input.adapter.generateTest({ identifier, witness });
  if (typeof generated !== "string" || generated.trim().length === 0) {
    throw new Error(`adapter ${input.adapter.id} generated empty test source`);
  }

  const source = normalizeSource(generated);
  let testFile: string | null = null;

  if (input.outputPath !== undefined) {
    testFile = path.resolve(input.outputPath);
    mkdirSync(path.dirname(testFile), { recursive: true });
    writeFileSync(testFile, source, "utf8");
  }

  return {
    identifier,
    adapterId: input.adapter.id,
    source,
    testFile,
  };
}

function normalizeSource(source: string): string {
  return `${source.replace(/\r\n?/g, "\n").trimEnd()}\n`;
}
