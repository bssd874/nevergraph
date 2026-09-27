import type { EvidenceItem, NeverRule } from "@nevergraph/schemas";
import type { ScenarioId, ScenarioSnapshot } from "./snapshot-schema";

/** Repository metadata derived from the analysis target's own package manifest. */
export interface RepositoryInfo {
  /** Short display name, e.g. "mercury". */
  name: string;
  /** Package name from the manifest, e.g. "@nevergraph/mercury". */
  packageName: string;
  /** Workspace-relative path of the analysed repository. */
  path: string;
  description: string | null;
}

/**
 * Everything the dashboard renders, loaded once from `.nevergraph/` and the
 * analysis target's manifest. There is no other source of truth in the UI.
 */
export interface DashboardData {
  repository: RepositoryInfo;
  /** Every latent Never Rule recovered by IBM Bob, from rules.json. */
  rules: NeverRule[];
  /** The full analyzer evidence corpus, from evidence.json. */
  evidence: EvidenceItem[];
  scenarios: Record<ScenarioId, ScenarioSnapshot>;
  /** Rule id that every captured scenario was searched against. */
  goldenRuleId: string;
}
