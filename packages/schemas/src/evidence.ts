import { z } from "zod";

/** Supported evidence types that the analyzer can extract from source code. */
export const EvidenceTypeSchema = z.enum([
  "guard",
  "state_transition",
  "negative_test",
  "throw",
  "comment",
  "constraint",
]);

export type EvidenceType = z.infer<typeof EvidenceTypeSchema>;

/**
 * A single piece of repository evidence that supports a latent negative invariant.
 * Every inferred NeverRule must cite at least two EvidenceItems by ID.
 */
export const EvidenceItemSchema = z.object({
  /** Stable identifier assigned by the normalizer, e.g. "ev-001". */
  id: z.string().min(1),
  type: EvidenceTypeSchema,
  /** Repository-relative file path, e.g. "src/services/shipment.service.ts". */
  file: z.string().min(1),
  /** 1-based line number. */
  line: z.number().int().positive(),
  /** Enclosing function or class name. */
  symbol: z.string(),
  /** Short verbatim source excerpt. */
  snippet: z.string(),
  /** Human-readable summary used as context for Bob's invariant synthesis. */
  summary: z.string().min(1),
  /** Extractor-specific supplementary data. */
  metadata: z.record(z.string(), z.unknown()),
});

export type EvidenceItem = z.infer<typeof EvidenceItemSchema>;
