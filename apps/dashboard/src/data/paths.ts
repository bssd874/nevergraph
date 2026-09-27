import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Walks upward from the current working directory to find the workspace root —
 * the directory that owns `.nevergraph/scenarios`. This keeps `next dev`,
 * `next build` and `vitest` (which all run with different cwds) in agreement.
 */
export function findWorkspaceRoot(startDir: string = process.cwd()): string {
  let current = path.resolve(startDir);

  for (;;) {
    if (existsSync(path.join(current, ".nevergraph", "scenarios"))) return current;
    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error(
        `could not locate a workspace root containing .nevergraph/scenarios above ${startDir}`,
      );
    }
    current = parent;
  }
}

export interface ArtifactPaths {
  workspaceRoot: string;
  rules: string;
  evidence: string;
  scenario: (scenario: string) => string;
  repositoryManifest: string;
  repositoryPath: string;
}

export function artifactPaths(workspaceRoot = findWorkspaceRoot()): ArtifactPaths {
  const nevergraph = path.join(workspaceRoot, ".nevergraph");
  return {
    workspaceRoot,
    rules: path.join(nevergraph, "rules.json"),
    evidence: path.join(nevergraph, "evidence.json"),
    scenario: (scenario) => path.join(nevergraph, "scenarios", `${scenario}.json`),
    repositoryManifest: path.join(workspaceRoot, "demo", "mercury", "package.json"),
    repositoryPath: "demo/mercury",
  };
}
