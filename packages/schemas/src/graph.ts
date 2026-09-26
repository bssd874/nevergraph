import { z } from "zod";
import { NeverRuleSchema } from "./rule.js";

/** A single node in the NeverGraph visualization. */
export const NeverGraphNodeSchema = z.object({
  /** Unique node identifier — typically the serialized GraphState key. */
  id: z.string().min(1),
  /** Display label for the node (state name). */
  label: z.string().min(1),
  /** Whether this node satisfies any ForbiddenCondition. */
  forbidden: z.boolean().optional(),
});

export type NeverGraphNode = z.infer<typeof NeverGraphNodeSchema>;

/** A directed edge in the NeverGraph representing a state transition. */
export const NeverGraphEdgeSchema = z.object({
  /** Unique edge identifier. */
  id: z.string().min(1),
  /** Source node id. */
  source: z.string().min(1),
  /** Target node id. */
  target: z.string().min(1),
  /** The action name that causes this transition. */
  action: z.string().min(1),
  /** True when this edge was not present in the baseline graph. */
  isNew: z.boolean().optional(),
  /** True when this edge is part of a violating witness path. */
  isViolating: z.boolean().optional(),
});

export type NeverGraphEdge = z.infer<typeof NeverGraphEdgeSchema>;

/** Reachability status for a single NeverRule. */
export const ReachabilityStatusSchema = z.enum(["unreachable", "reachable", "unknown"]);
export type ReachabilityStatus = z.infer<typeof ReachabilityStatusSchema>;

/**
 * The compiled NeverGraph: nodes, edges, forbidden conditions, and
 * per-rule reachability status.  Serialized to .nevergraph/analysis.json.
 */
export const NeverGraphDataSchema = z.object({
  nodes: z.array(NeverGraphNodeSchema),
  edges: z.array(NeverGraphEdgeSchema),
  /** The NeverRules compiled into this graph. */
  forbiddenConditions: z.array(NeverRuleSchema),
  /**
   * Maps rule id → reachability status.
   * e.g. { "NEVER-003": "unreachable" }
   */
  reachabilityStatus: z.record(z.string(), ReachabilityStatusSchema),
});

export type NeverGraphData = z.infer<typeof NeverGraphDataSchema>;
