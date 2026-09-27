/**
 * scan_repository.ts
 *
 * MCP tool: scan_repository
 * Thin wrapper around @nevergraph/analyzer. Resolves the repository path
 * safely, runs the analyzer, and persists evidence + transitions to
 * .nevergraph/. Does NOT reimplement any AST logic.
 */

import path from "node:path";
import { existsSync, statSync } from "node:fs";
import { analyzeRepository, persistResults } from "@nevergraph/analyzer";

export interface ScanRepositoryInput {
  repoPath: string;
  workspaceRoot: string;
}

export interface ScanRepositoryOutput {
  evidenceCount: number;
  transitionCount: number;
  evidencePath: string;
  transitionsPath: string;
}

/**
 * Resolve and validate a repository path, then run the deterministic analyzer.
 *
 * Path safety:
 * - Resolves the path against workspaceRoot if relative.
 * - Rejects if the path does not exist.
 * - Rejects if the path is not a directory.
 * - Never constructs shell commands from the raw path string.
 */
export function scanRepository(input: ScanRepositoryInput): ScanRepositoryOutput {
  const repoRoot = path.isAbsolute(input.repoPath)
    ? input.repoPath
    : path.resolve(input.workspaceRoot, input.repoPath);

  if (!existsSync(repoRoot)) {
    throw new Error(`repository path does not exist: ${repoRoot}`);
  }

  const stat = statSync(repoRoot);
  if (!stat.isDirectory()) {
    throw new Error(`repository path is not a directory: ${repoRoot}`);
  }

  const result = analyzeRepository({ repoRoot });

  persistResults(result.evidence, result.transitions, {
    workspaceRoot: input.workspaceRoot,
  });

  const nevergraphDir = path.resolve(input.workspaceRoot, ".nevergraph");

  return {
    evidenceCount: result.evidence.length,
    transitionCount: result.transitions.length,
    evidencePath: path.join(nevergraphDir, "evidence.json"),
    transitionsPath: path.join(nevergraphDir, "transitions.json"),
  };
}
