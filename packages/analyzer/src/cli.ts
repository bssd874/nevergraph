#!/usr/bin/env node
/**
 * cli.ts — minimal CLI entry point for @nevergraph/analyzer
 *
 * Usage:
 *   node dist/cli.js <repo-path> [--workspace <workspace-root>]
 *
 * Analyzes the TypeScript repository at <repo-path> and writes results to
 * <workspace-root>/.nevergraph/ (defaults to current working directory).
 *
 * Example (from monorepo root):
 *   pnpm --filter @nevergraph/analyzer analyze demo/mercury
 */

import path from "node:path";
import { analyzeRepository, persistResults } from "./index.js";

function usage(): void {
  console.error(
    "Usage: analyze <repo-path> [--workspace <workspace-root>]\n" +
    "  repo-path        Path to the TypeScript repository to analyze\n" +
    "  --workspace      Directory where .nevergraph/ will be written (default: cwd)",
  );
}

function main(): void {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    usage();
    process.exit(0);
  }

  const repoPathArg = args[0];
  if (!repoPathArg) {
    usage();
    process.exit(1);
  }

  let workspaceRoot = process.cwd();
  const wsIdx = args.indexOf("--workspace");
  if (wsIdx !== -1 && args[wsIdx + 1]) {
    workspaceRoot = path.resolve(args[wsIdx + 1]!);
  }

  const repoRoot = path.resolve(repoPathArg);

  console.log(`[analyzer] Analyzing repository: ${repoRoot}`);

  const result = analyzeRepository({ repoRoot });

  console.log(`[analyzer] Found ${result.evidence.length} evidence items`);
  console.log(`[analyzer] Found ${result.transitions.length} state transitions`);

  persistResults(result.evidence, result.transitions, { workspaceRoot });

  console.log(`[analyzer] Written to ${path.join(workspaceRoot, ".nevergraph/")}`);
  console.log("[analyzer] evidence.json  ✓");
  console.log("[analyzer] transitions.json  ✓");
}

main();
