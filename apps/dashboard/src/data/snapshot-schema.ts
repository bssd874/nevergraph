/**
 * Zod contracts for the artifacts written under `.nevergraph/`.
 *
 * The primitives (rules, evidence, transitions, graph states, witnesses) are
 * imported from `@nevergraph/schemas` so the dashboard never re-declares the
 * canonical pipeline contracts. Only the scenario *envelope* produced by
 * `scripts/capture-nevergraph-scenario.mjs` is described here, because that
 * envelope is a capture-time composition rather than a pipeline type.
 */
import { z } from "zod";
import {
  EvidenceItemSchema,
  GraphStateSchema,
  NeverRuleSchema,
  StateTransitionSchema,
  WitnessSchema,
} from "@nevergraph/schemas";

export const SCENARIO_IDS = ["baseline", "changed", "repaired"] as const;

export const ScenarioIdSchema = z.enum(SCENARIO_IDS);
export type ScenarioId = z.infer<typeof ScenarioIdSchema>;

/** Bounded-BFS outcome, mirroring the graph engine's own status vocabulary. */
export const SearchStatusSchema = z.enum(["found", "unreachable", "limit_reached"]);
export type SearchStatus = z.infer<typeof SearchStatusSchema>;

export const SearchResultSchema = z.object({
  status: SearchStatusSchema,
  /** Concrete forbidden state when status is "found", otherwise null. */
  finalState: GraphStateSchema.nullable(),
  /** Transition definitions traversed by the witness path (empty when not found). */
  path: z.array(StateTransitionSchema),
  depth: z.number().int().nonnegative().nullable(),
  exploredStateCount: z.number().int().nonnegative(),
  limits: z.object({
    maxDepth: z.number().int().positive(),
    maxVisitedStates: z.number().int().positive(),
  }),
  limitReason: z.string().min(1).optional(),
});
export type SearchResult = z.infer<typeof SearchResultSchema>;

export const SnapshotGraphNodeSchema = z.object({
  /** Serialized GraphState — the engine's canonical node key. */
  id: z.string().min(1),
  label: z.string().min(1),
  forbidden: z.boolean().optional(),
  graphState: GraphStateSchema,
});
export type SnapshotGraphNode = z.infer<typeof SnapshotGraphNodeSchema>;

export const SnapshotGraphEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  action: z.string().min(1),
});
export type SnapshotGraphEdge = z.infer<typeof SnapshotGraphEdgeSchema>;

/** Proof summary embedded by the capture script from a runner execution artifact. */
export const ProofSummarySchema = z.object({
  identifier: z.string().min(1),
  status: z.enum(["reproduced", "not_reproduced", "execution_error"]),
  testResult: z.enum(["pass", "fail", "error"]),
  exitCode: z.number().int().nullable(),
  timedOut: z.boolean(),
  testFile: z.string().min(1),
});
export type ProofSummary = z.infer<typeof ProofSummarySchema>;

export const ScenarioSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  scenario: ScenarioIdSchema,
  selectedRule: NeverRuleSchema,
  evidence: z.array(EvidenceItemSchema),
  initialState: GraphStateSchema,
  transitions: z.array(StateTransitionSchema),
  search: SearchResultSchema,
  graph: z.object({
    nodes: z.array(SnapshotGraphNodeSchema).min(1),
    edges: z.array(SnapshotGraphEdgeSchema),
  }),
  /**
   * The minimum counterexample. Present whenever the capture run had a witness
   * artifact on hand — including the `repaired` scenario, where the witness is
   * the *historical* sequence that the generated regression test replays, not a
   * live search result. Always gate live-violation UI on `search.status`.
   */
  witness: WitnessSchema.nullable(),
  proof: ProofSummarySchema.nullable(),
});
export type ScenarioSnapshot = z.infer<typeof ScenarioSnapshotSchema>;

/** Subset of `demo/mercury/package.json` used for truthful repository metadata. */
export const RepositoryManifestSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1).optional(),
  version: z.string().min(1).optional(),
});
export type RepositoryManifest = z.infer<typeof RepositoryManifestSchema>;

export const RulesFileSchema = z.array(NeverRuleSchema).min(1);
export const EvidenceFileSchema = z.array(EvidenceItemSchema).min(1);
