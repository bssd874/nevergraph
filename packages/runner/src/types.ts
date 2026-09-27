import type { TestResult, Witness } from "@nevergraph/schemas";

export type SafetyAssertion = "path_must_throw";

export interface WitnessTestAdapterInput {
  identifier: string;
  witness: Witness;
}

/** Explicit boundary between generic witness handling and domain templates. */
export interface WitnessTestAdapter {
  id: string;
  safetyAssertion: SafetyAssertion;
  supports(witness: Witness): boolean;
  generateTest(input: WitnessTestAdapterInput): string;
}

export interface GenerateRegressionTestInput {
  identifier: string;
  witness: Witness;
  adapter: WitnessTestAdapter;
  /** When supplied, the validated generated source is written here. */
  outputPath?: string;
}

export interface GeneratedRegressionTest {
  identifier: string;
  adapterId: string;
  source: string;
  testFile: string | null;
}

export interface RunGeneratedTestInput {
  identifier: string;
  cwd: string;
  /** Test path relative to cwd, or an absolute path within cwd. */
  testFile: string;
  /** Vitest config path relative to cwd, or an absolute path within cwd. */
  configFile?: string;
  timeoutMs?: number;
  /** Primarily for deterministic embedding; defaults to the installed Vitest CLI. */
  vitestCliPath?: string;
}

/** Raw process data accepted by the deterministic Vitest result classifier. */
export interface VitestProcessOutput {
  exitCode: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  spawnError: Error | null;
}

export type ProofExecutionStatus =
  | "reproduced"
  | "not_reproduced"
  | "execution_error";

/** Truthful Phase 4 execution artifact; contains no repair lifecycle fields. */
export interface ProofExecutionResult {
  identifier: string;
  testFile: string;
  cwd: string;
  command: string[];
  exitCode: number | null;
  signal: string | null;
  status: ProofExecutionStatus;
  testResult: TestResult;
  stdout: string;
  stderr: string;
  stdoutSummary: string;
  stderrSummary: string;
  timedOut: boolean;
}
