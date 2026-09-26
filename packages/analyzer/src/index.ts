/**
 * @nevergraph/analyzer
 *
 * Deterministic TypeScript repository analyzer using ts-morph.
 *
 * Public API:
 *   analyzeRepository(options) → { evidence, transitions }
 *
 * See README or inline docs for the supported grammar constraints.
 */

import { EvidenceItem, StateTransition } from "@nevergraph/schemas";
import { scanRepository, ScanOptions } from "./scanner.js";
import { normalize } from "./normalizer.js";

export { persistResults } from "./persist.js";
export type { PersistOptions } from "./persist.js";

export interface AnalyzeOptions {
  /** Absolute path to the root of the TypeScript repository to analyze */
  repoRoot: string;
  /** Optional glob overrides passed to the scanner */
  sourceGlobs?: ScanOptions["sourceGlobs"];
  testGlobs?: ScanOptions["testGlobs"];
}

export interface AnalyzeResult {
  evidence: EvidenceItem[];
  transitions: StateTransition[];
}

/**
 * Analyze a TypeScript repository and return structured evidence and transitions.
 *
 * The result arrays are Zod-validated before being returned.
 * Call persistResults() to write them to .nevergraph/.
 */
export function analyzeRepository(options: AnalyzeOptions): AnalyzeResult {
  const scanOpts: ScanOptions = { repoRoot: options.repoRoot };
  if (options.sourceGlobs !== undefined) scanOpts.sourceGlobs = options.sourceGlobs;
  if (options.testGlobs !== undefined) scanOpts.testGlobs = options.testGlobs;
  const scan = scanRepository(scanOpts);

  return normalize(
    scan.statusAssignments,
    scan.factAssignments,
    scan.guards,
    scan.negativeTests,
  );
}
