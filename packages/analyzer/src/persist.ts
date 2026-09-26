/**
 * persist.ts
 *
 * Validates and writes analyzer output to .nevergraph/ JSON files.
 * Never writes invalid data — Zod validation is run before every write.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { EvidenceItemSchema, StateTransitionSchema, EvidenceItem, StateTransition } from "@nevergraph/schemas";

const EvidenceArraySchema = EvidenceItemSchema.array();
const TransitionArraySchema = StateTransitionSchema.array();

export interface PersistOptions {
  /** Root workspace directory (where .nevergraph/ will be written) */
  workspaceRoot: string;
}

export function persistResults(
  evidence: EvidenceItem[],
  transitions: StateTransition[],
  options: PersistOptions,
): void {
  // Validate before write
  EvidenceArraySchema.parse(evidence);
  TransitionArraySchema.parse(transitions);

  const outDir = path.join(options.workspaceRoot, ".nevergraph");
  mkdirSync(outDir, { recursive: true });

  writeFileSync(
    path.join(outDir, "evidence.json"),
    JSON.stringify(evidence, null, 2) + "\n",
    "utf-8",
  );

  writeFileSync(
    path.join(outDir, "transitions.json"),
    JSON.stringify(transitions, null, 2) + "\n",
    "utf-8",
  );
}
