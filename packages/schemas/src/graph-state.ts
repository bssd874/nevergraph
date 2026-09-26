import { z } from "zod";

/**
 * A generic, domain-agnostic representation of a state-machine node.
 *
 * `state`  — the discrete state label (e.g. "PAID", "SHIPPED").
 * `facts`  — arbitrary key/value context carried alongside the state
 *            (e.g. { refunded: true }).  Keys are domain-defined by the
 *            analyzer normalizer; this type is intentionally domain-agnostic.
 *
 * No Mercury-specific field names appear in this type.
 */
export const GraphStateSchema = z.object({
  state: z.string().min(1),
  facts: z.record(z.string(), z.union([z.boolean(), z.string(), z.number(), z.null()])),
});

export type GraphState = z.infer<typeof GraphStateSchema>;

/**
 * A single guard condition extracted from source code.
 * Represents one branch of an entry check before a state transition, e.g.
 *   if (order.refundedAt) throw ...
 * normalized to:
 *   { field: "refunded", operator: "truthy", value: null }
 */
export const GuardSignalSchema = z.object({
  /** Normalized fact key — matches a key in GraphState.facts. */
  field: z.string().min(1),
  operator: z.enum(["eq", "neq", "truthy", "falsy"]),
  value: z.union([z.boolean(), z.string(), z.number(), z.null()]),
});

export type GuardSignal = z.infer<typeof GuardSignalSchema>;
