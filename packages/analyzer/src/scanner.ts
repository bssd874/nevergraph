/**
 * scanner.ts
 *
 * Walks a repository directory using ts-morph and applies all extractors.
 * Returns raw observations that the normalizer then converts to schema types.
 */

import { Project, SourceFile } from "ts-morph";
import path from "node:path";
import {
  RawStatusAssignment,
  RawFactAssignment,
  RawGuard,
  RawNegativeTest,
} from "./types.js";
import { extractStatusAssignments, extractFactAssignments } from "./extractors/assignments.js";
import { extractGuards } from "./extractors/guards.js";
import { extractNegativeTests } from "./extractors/tests.js";

export interface ScanOptions {
  /** Absolute path to the root of the repository to analyze */
  repoRoot: string;
  /**
   * Glob patterns relative to repoRoot for source files.
   * Defaults to TypeScript source files excluding node_modules and test files.
   */
  sourceGlobs?: string[];
  /**
   * Glob patterns relative to repoRoot for test files.
   * Defaults to common Vitest/Jest test patterns.
   */
  testGlobs?: string[];
}

export interface ScanResult {
  statusAssignments: RawStatusAssignment[];
  factAssignments: RawFactAssignment[];
  guards: RawGuard[];
  negativeTests: RawNegativeTest[];
}

/** Build a ts-morph Project from source globs */
function buildProject(repoRoot: string, globs: string[]): Project {
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    compilerOptions: {
      strict: false,
      skipLibCheck: true,
      allowJs: false,
    },
  });
  for (const glob of globs) {
    project.addSourceFilesAtPaths(path.join(repoRoot, glob));
  }
  return project;
}

/** Make a file path relative to repoRoot, normalizing separators */
export function toRelativePath(repoRoot: string, absPath: string): string {
  return path.relative(repoRoot, absPath).replace(/\\/g, "/");
}

export function scanRepository(options: ScanOptions): ScanResult {
  const {
    repoRoot,
    sourceGlobs = ["src/**/*.ts", "!src/**/*.test.ts", "!src/**/__tests__/**"],
    testGlobs = ["src/**/*.test.ts", "src/**/__tests__/**/*.test.ts"],
  } = options;

  const sourceProject = buildProject(repoRoot, sourceGlobs);
  const testProject = buildProject(repoRoot, testGlobs);

  const statusAssignments: RawStatusAssignment[] = [];
  const factAssignments: RawFactAssignment[] = [];
  const guards: RawGuard[] = [];
  const negativeTests: RawNegativeTest[] = [];

  for (const sf of sourceProject.getSourceFiles()) {
    const rel = toRelativePath(repoRoot, sf.getFilePath());
    statusAssignments.push(...extractStatusAssignments(sf, rel));
    factAssignments.push(...extractFactAssignments(sf, rel));
    guards.push(...extractGuards(sf, rel));
  }

  for (const sf of testProject.getSourceFiles()) {
    const rel = toRelativePath(repoRoot, sf.getFilePath());
    negativeTests.push(...extractNegativeTests(sf, rel));
  }

  return { statusAssignments, factAssignments, guards, negativeTests };
}
