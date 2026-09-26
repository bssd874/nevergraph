import { z } from "zod";
import { ForbiddenConditionSchema } from "./forbidden-condition.js";

/** Confidence level of an inferred NeverRule, derived from evidence count. */
export const ConfidenceSchema = z.enum(["low", "medium", "high"]);
export type Confidence = z.infer<typeof ConfidenceSchema>;

/**
 * A latent negative invariant recovered by IBM Bob from repository evidence.
 *
 * Rules are NEVER hardcoded. They are inferred by Bob, validated by Zod,
 * and stored in .nevergraph/rules.json. The graph engine reads them from
 * that file — it never sees a hardcoded rule description.
 */
export const NeverRuleSchema = z.object({
  /** Stable rule identifier, e.g. "NEVER-003". Assigned by Bob during synthesis. */
  id: z.string().min(1),
  /** Human-readable description of the invariant, authored by Bob. */
  description: z.string().min(1),
  confidence: ConfidenceSchema,
  /**
   * Machine-evaluable forbidden condition that the graph engine uses for BFS.
   * Uses generic GraphState semantics — no domain-specific field names.
   */
  forbiddenCondition: ForbiddenConditionSchema,
  /**
   * At least two independent evidence items must support a high-confidence rule.
   * References into evidence.json by evidenceId.
   */
  evidence: z
    .array(
      z.object({
        evidenceId: z.string().min(1),
        file: z.string().min(1),
        line: z.number().int().positive(),
      })
    )
    .min(1),
});

export type NeverRule = z.infer<typeof NeverRuleSchema>;
