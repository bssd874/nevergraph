import { z } from "zod";
import { GraphStateSchema } from "./graph-state.js";
import { GuardSignalSchema } from "./graph-state.js";

/**
 * A single state transition extracted from the analyzed repository.
 *
 * `from` and `to` use GraphState so the graph engine can evaluate transitions
 * in a domain-agnostic way using fact-based context flags.
 *
 * When `from.state` is "UNKNOWN" the engine treats the transition as reachable
 * from any preceding state (conservative over-approximation).
 */
export const StateTransitionSchema = z.object({
  /** Stable identifier assigned by the normalizer, e.g. "tr-001". */
  id: z.string().min(1),
  /**
   * The name of the action/function that performs this transition,
   * e.g. "shipOrder", "refundOrder".
   */
  action: z.string().min(1),
  /**
   * Pre-transition state + facts inferred from guard conditions.
   * Set to { state: "UNKNOWN", facts: {} } when the from-state cannot be determined.
   */
  from: GraphStateSchema,
  /** Post-transition state + facts produced by this action. */
  to: GraphStateSchema,
  /** Repository-relative source file path. */
  file: z.string().min(1),
  /** 1-based line number of the status assignment. */
  line: z.number().int().positive(),
  /** Guard conditions detected at the function entry point. */
  guards: z.array(GuardSignalSchema),
});

export type StateTransition = z.infer<typeof StateTransitionSchema>;
