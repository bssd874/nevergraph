import { z } from "zod";

/**
 * A machine-evaluable forbidden condition.
 *
 * The graph engine checks whether a GraphState node satisfies this condition by:
 *   1. state === targetState
 *   2. every key in requiredFacts matches the node's facts
 *
 * No domain-specific field names appear here — those live in requiredFacts values
 * supplied by the analyzer normalizer.
 */
export const ForbiddenConditionSchema = z.object({
  /** The state label that is forbidden when requiredFacts hold. */
  targetState: z.string().min(1),
  /**
   * Facts that must be present and matching on the node for the condition to fire.
   * Example: { refunded: true } means the node must have facts.refunded === true.
   */
  requiredFacts: z.record(
    z.string(),
    z.union([z.boolean(), z.string(), z.number(), z.null()])
  ),
});

export type ForbiddenCondition = z.infer<typeof ForbiddenConditionSchema>;
