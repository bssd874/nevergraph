import { z } from "zod";
import { GraphStateSchema } from "./graph-state.js";

/** A single step in a violating witness sequence. */
export const WitnessStepSchema = z.object({
  /** The action that caused this transition, e.g. "restoreOrder". */
  action: z.string().min(1),
  fromState: GraphStateSchema,
  toState: GraphStateSchema,
});

export type WitnessStep = z.infer<typeof WitnessStepSchema>;

/**
 * The minimum violating transition sequence found by BFS for a given NeverRule.
 *
 * A Witness contains enough information to generate an executable Vitest
 * regression test and a human-readable step list.
 */
export const WitnessSchema = z.object({
  /** The rule this witness violates. */
  ruleId: z.string().min(1),
  /** Ordered sequence of transitions from an entry state to the forbidden state. */
  steps: z.array(WitnessStepSchema).min(1),
  /** Total number of transitions (= steps.length). */
  length: z.number().int().positive(),
  /** True when the final toState satisfies the rule's ForbiddenCondition. */
  isForbidden: z.boolean(),
});

export type Witness = z.infer<typeof WitnessSchema>;
