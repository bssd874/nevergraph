import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import type {
  ProofExecutionResult,
  ProofExecutionStatus,
  RunGeneratedTestInput,
  VitestProcessOutput,
} from "./types.js";
import { validateArtifactIdentifier } from "./artifacts.js";

interface VitestAssertionResult {
  status?: unknown;
}

interface VitestTestFileResult {
  assertionResults?: unknown;
}

interface VitestJsonReport {
  numTotalTests?: unknown;
  numFailedTests?: unknown;
  testResults?: unknown;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const SUMMARY_LIMIT = 4_000;
const require = createRequire(import.meta.url);

/** Execute one generated regression test with Vitest's structured JSON reporter. */
export async function runGeneratedTest(
  input: RunGeneratedTestInput,
): Promise<ProofExecutionResult> {
  const identifier = validateArtifactIdentifier(input.identifier);
  const cwd = path.resolve(input.cwd);
  const testFile = resolveWithinCwd(cwd, input.testFile, "testFile");
  const configFile = input.configFile === undefined
    ? null
    : resolveWithinCwd(cwd, input.configFile, "configFile");
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError("timeoutMs must be a positive integer");
  }

  const vitestCli = input.vitestCliPath === undefined
    ? defaultVitestCliPath()
    : path.resolve(input.vitestCliPath);
  const args = [vitestCli, "run", testFile, "--reporter=json"];
  if (configFile !== null) args.push("--config", configFile);
  const command = [process.execPath, ...args];
  const raw = await executeProcess(process.execPath, args, cwd, timeoutMs);
  const classification = classifyVitestExecution(raw);

  return {
    identifier,
    testFile,
    cwd,
    command,
    exitCode: raw.exitCode,
    signal: raw.signal,
    status: classification.status,
    testResult: classification.testResult,
    stdout: raw.stdout,
    stderr: raw.stderr,
    stdoutSummary: summarize(raw.stdout),
    stderrSummary: summarize(raw.stderr),
    timedOut: raw.timedOut,
  };
}

export function classifyVitestExecution(raw: VitestProcessOutput): {
  status: ProofExecutionStatus;
  testResult: "pass" | "fail" | "error";
} {
  if (raw.spawnError !== null || raw.timedOut || raw.exitCode === null) {
    return { status: "execution_error", testResult: "error" };
  }

  const report = parseVitestJson(raw.stdout);
  if (report === null) {
    return { status: "execution_error", testResult: "error" };
  }

  const totalTests = numericField(report.numTotalTests);
  const failedTests = numericField(report.numFailedTests);
  const hasFailedAssertion = reportHasFailedAssertion(report);

  if (raw.exitCode === 0 && totalTests > 0 && failedTests === 0) {
    return { status: "not_reproduced", testResult: "pass" };
  }

  if (raw.exitCode !== 0 && failedTests > 0 && hasFailedAssertion) {
    return { status: "reproduced", testResult: "fail" };
  }

  return { status: "execution_error", testResult: "error" };
}

function executeProcess(
  executable: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
): Promise<VitestProcessOutput> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let spawnError: Error | null = null;

    const child = spawn(executable, args, {
      cwd,
      env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      spawnError = error;
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);

    child.on("close", (exitCode, signal) => {
      clearTimeout(timer);
      resolve({
        exitCode,
        signal,
        stdout,
        stderr,
        timedOut,
        spawnError,
      });
    });
  });
}

function defaultVitestCliPath(): string {
  return require.resolve("vitest/vitest.mjs");
}

function resolveWithinCwd(cwd: string, target: string, field: string): string {
  const resolved = path.resolve(cwd, target);
  const relative = path.relative(cwd, resolved);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`${field} must resolve within cwd`);
  }
  return resolved;
}

function parseVitestJson(stdout: string): VitestJsonReport | null {
  try {
    const parsed: unknown = JSON.parse(stdout.trim());
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function reportHasFailedAssertion(report: VitestJsonReport): boolean {
  if (!Array.isArray(report.testResults)) return false;

  return report.testResults.some((testFile: unknown) => {
    if (!isRecord(testFile) || !Array.isArray(testFile.assertionResults)) return false;
    return testFile.assertionResults.some(
      (assertion: unknown) =>
        isRecord(assertion) && (assertion as VitestAssertionResult).status === "failed",
    );
  });
}

function numericField(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : -1;
}

function isRecord(value: unknown): value is VitestJsonReport & VitestTestFileResult {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function summarize(output: string): string {
  const normalized = output.trim();
  if (normalized.length <= SUMMARY_LIMIT) return normalized;
  return `${normalized.slice(0, SUMMARY_LIMIT)}\n…[truncated]`;
}
