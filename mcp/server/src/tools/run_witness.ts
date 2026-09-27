/**
 * run_witness.ts
 *
 * MCP tool: run_witness
 *
 * Delegates entirely to @nevergraph/runner.
 * Does NOT reimplement test generation, Vitest execution, or result
 * classification. Returns the truthful ProofExecutionResult.
 *
 * Phase 5 note: This tool can be tested against controlled fixtures.
 * The real Mercury regression test is only generated in Phase 6 after
 * the Support Restore bug is introduced.
 */

import path from "node:path";
import { existsSync } from "node:fs";
import {
  runGeneratedTest,
  type RunGeneratedTestInput,
  type ProofExecutionResult,
} from "@nevergraph/runner";

export interface RunWitnessInput {
  /** Stable identifier matching the witness ruleId, e.g. "NEVER-001" */
  identifier: string;
  /** Working directory for vitest (typically the analyzed repo root) */
  cwd: string;
  /** Path to the generated test file, relative to cwd or absolute within cwd */
  testFile: string;
  /** Optional path to vitest config, relative to cwd */
  configFile?: string;
  /** Timeout in milliseconds (default: 30000) */
  timeoutMs?: number;
}

export interface RunWitnessOutput {
  identifier: string;
  status: "reproduced" | "not_reproduced" | "execution_error";
  testResult: "pass" | "fail" | "error";
  exitCode: number | null;
  stdoutSummary: string;
  stderrSummary: string;
  timedOut: boolean;
}

function toRunnerTestResult(v: "pass" | "fail" | "error" | "not_run"): "pass" | "fail" | "error" {
  if (v === "not_run") return "error";
  return v;
}

/**
 * Validate the test file path and delegate execution to @nevergraph/runner.
 * This handler adds NO execution logic.
 */
export async function runWitness(input: RunWitnessInput): Promise<RunWitnessOutput> {
  const cwd = path.resolve(input.cwd);

  if (!existsSync(cwd)) {
    throw new Error(`cwd does not exist: ${cwd}`);
  }

  // Resolve test file relative to cwd for existence check
  const resolvedTestFile = path.isAbsolute(input.testFile)
    ? input.testFile
    : path.resolve(cwd, input.testFile);

  if (!existsSync(resolvedTestFile)) {
    throw new Error(`testFile does not exist: ${resolvedTestFile}`);
  }

  const runInput: RunGeneratedTestInput = {
    identifier: input.identifier,
    cwd,
    testFile: input.testFile,
  };
  if (input.configFile !== undefined) runInput.configFile = input.configFile;
  if (input.timeoutMs !== undefined) runInput.timeoutMs = input.timeoutMs;

  const result: ProofExecutionResult = await runGeneratedTest(runInput);

  return {
    identifier: result.identifier,
    status: result.status,
    testResult: toRunnerTestResult(result.testResult),
    exitCode: result.exitCode,
    stdoutSummary: result.stdoutSummary,
    stderrSummary: result.stderrSummary,
    timedOut: result.timedOut,
  };
}
