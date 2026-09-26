import { z } from "zod";
import { WitnessSchema } from "./witness.js";

/**
 * Lifecycle status of a proof attempt for a single NeverRule.
 *
 * suspected   — BFS reports reachable but no executable test run yet
 * reproduced  — generated test fails against the buggy implementation
 * fixed       — repair has been applied
 * verified    — regression test passes and existing tests pass after repair
 */
export const ProofStatusSchema = z.enum(["suspected", "reproduced", "fixed", "verified"]);
export type ProofStatus = z.infer<typeof ProofStatusSchema>;

export const TestResultSchema = z.enum(["pass", "fail", "error", "not_run"]);
export type TestResult = z.infer<typeof TestResultSchema>;

/**
 * Proof receipt for a single NeverRule.
 * Written to .nevergraph/proofs/{ruleId}.json by the runner.
 */
export const ProofReceiptSchema = z.object({
  ruleId: z.string().min(1),
  /** Whether BFS found a violating path. */
  foundViolation: z.boolean(),
  /** The minimum witness, or null when no violation was found. */
  witness: WitnessSchema.nullable(),
  /** Path to the generated regression test file, relative to the repo root. */
  testFile: z.string().nullable(),
  /**
   * Result of executing the generated regression test.
   * "error" means the test runner crashed for infrastructure reasons (bad imports, etc.)
   * and must NOT be treated as a confirmed violation.
   */
  testResult: TestResultSchema,
  /** True when Bob has applied a repair. */
  repairApplied: z.boolean(),
  /** Result of re-running the regression test after repair. */
  verificationResult: TestResultSchema,
  /** Result of running the existing test suite after repair. */
  existingTestsResult: TestResultSchema,
  /** Aggregate lifecycle status. */
  status: ProofStatusSchema,
  /** ISO 8601 timestamp of this receipt. */
  timestamp: z.string().datetime(),
});

export type ProofReceipt = z.infer<typeof ProofReceiptSchema>;
