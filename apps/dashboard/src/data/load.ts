import { readFileSync } from "node:fs";
import { artifactPaths, findWorkspaceRoot, type ArtifactPaths } from "./paths";
import {
  EvidenceFileSchema,
  RepositoryManifestSchema,
  RulesFileSchema,
  SCENARIO_IDS,
  ScenarioSnapshotSchema,
  type ScenarioId,
  type ScenarioSnapshot,
} from "./snapshot-schema";
import type { DashboardData, RepositoryInfo } from "./types";

function readJson(filePath: string): unknown {
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as unknown;
  } catch (cause) {
    throw new Error(`failed to read NeverGraph artifact: ${filePath}`, { cause });
  }
}

function loadRepository(paths: ArtifactPaths): RepositoryInfo {
  const manifest = RepositoryManifestSchema.parse(readJson(paths.repositoryManifest));
  // "@nevergraph/mercury" → "mercury"; a bare name is used as-is.
  const shortName = manifest.name.includes("/")
    ? manifest.name.slice(manifest.name.lastIndexOf("/") + 1)
    : manifest.name;

  return {
    name: shortName,
    packageName: manifest.name,
    path: paths.repositoryPath,
    description: manifest.description ?? null,
  };
}

/**
 * Loads and validates every canonical artifact the dashboard renders.
 *
 * Every value returned here came out of `.nevergraph/` (or the analysis
 * target's own manifest) and passed the shared Zod contracts. Nothing is
 * defaulted, synthesised or hard-coded — a malformed artifact fails the build
 * rather than rendering an invented number.
 */
export function loadDashboardData(workspaceRoot = findWorkspaceRoot()): DashboardData {
  const paths = artifactPaths(workspaceRoot);

  const rules = RulesFileSchema.parse(readJson(paths.rules));
  const evidence = EvidenceFileSchema.parse(readJson(paths.evidence));

  const entries = SCENARIO_IDS.map((scenario): [ScenarioId, ScenarioSnapshot] => {
    const snapshot = ScenarioSnapshotSchema.parse(readJson(paths.scenario(scenario)));
    if (snapshot.scenario !== scenario) {
      throw new Error(
        `scenario artifact mismatch: ${scenario}.json declares scenario "${snapshot.scenario}"`,
      );
    }
    return [scenario, snapshot];
  });

  const scenarios = Object.fromEntries(entries) as Record<ScenarioId, ScenarioSnapshot>;

  const goldenRuleIds = new Set(entries.map(([, snapshot]) => snapshot.selectedRule.id));
  if (goldenRuleIds.size !== 1) {
    throw new Error(
      `captured scenarios disagree on the selected rule: ${[...goldenRuleIds].join(", ")}`,
    );
  }
  const goldenRuleId = [...goldenRuleIds][0] as string;

  if (!rules.some((rule) => rule.id === goldenRuleId)) {
    throw new Error(`selected rule ${goldenRuleId} is absent from rules.json`);
  }

  return {
    repository: loadRepository(paths),
    rules,
    evidence,
    scenarios,
    goldenRuleId,
  };
}
