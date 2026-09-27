import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { WitnessSchema, type Witness } from "@nevergraph/schemas";
import type { ProofExecutionResult } from "./types.js";

const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function validateArtifactIdentifier(identifier: string): string {
  if (!SAFE_IDENTIFIER.test(identifier) || identifier === "." || identifier === "..") {
    throw new Error(
      "identifier must begin with an alphanumeric character and contain only alphanumerics, '.', '_', or '-'",
    );
  }
  return identifier;
}

function canonicalJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJsonValue);

  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort(compareStrings)
        .map((key) => [key, canonicalJsonValue(record[key])]),
    );
  }

  return value;
}

function compareStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

export function serializeWitness(witness: Witness): string {
  const validated = WitnessSchema.parse(witness);
  return `${JSON.stringify(canonicalJsonValue(validated), null, 2)}\n`;
}

export function persistWitness(witness: Witness, outputPath: string): string {
  const serialized = serializeWitness(witness);
  const resolvedPath = path.resolve(outputPath);
  mkdirSync(path.dirname(resolvedPath), { recursive: true });
  writeFileSync(resolvedPath, serialized, "utf8");
  return resolvedPath;
}

export function serializeProofExecution(result: ProofExecutionResult): string {
  validateProofExecutionResult(result);
  return `${JSON.stringify(canonicalJsonValue(result), null, 2)}\n`;
}

export function persistProofExecution(
  result: ProofExecutionResult,
  outputPath: string,
): string {
  const serialized = serializeProofExecution(result);
  const resolvedPath = path.resolve(outputPath);
  mkdirSync(path.dirname(resolvedPath), { recursive: true });
  writeFileSync(resolvedPath, serialized, "utf8");
  return resolvedPath;
}

export function generatedTestPath(workspaceRoot: string, identifier: string): string {
  return path.resolve(
    workspaceRoot,
    ".nevergraph",
    "generated-tests",
    `${validateArtifactIdentifier(identifier)}.test.ts`,
  );
}

export function witnessArtifactPath(workspaceRoot: string, identifier: string): string {
  return path.resolve(
    workspaceRoot,
    ".nevergraph",
    "witnesses",
    `${validateArtifactIdentifier(identifier)}.json`,
  );
}

export function proofExecutionPath(workspaceRoot: string, identifier: string): string {
  return path.resolve(
    workspaceRoot,
    ".nevergraph",
    "proofs",
    `${validateArtifactIdentifier(identifier)}.execution.json`,
  );
}

function validateProofExecutionResult(result: ProofExecutionResult): void {
  validateArtifactIdentifier(result.identifier);
  if (result.command.length === 0 || result.command.some((part) => part.length === 0)) {
    throw new Error("proof execution command must contain non-empty arguments");
  }
  if (!["reproduced", "not_reproduced", "execution_error"].includes(result.status)) {
    throw new Error("invalid proof execution status");
  }
  if (!["pass", "fail", "error"].includes(result.testResult)) {
    throw new Error("invalid proof execution test result");
  }
}
