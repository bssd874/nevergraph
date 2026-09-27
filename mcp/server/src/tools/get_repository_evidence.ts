/**
 * get_repository_evidence.ts
 *
 * MCP tool: get_repository_evidence
 * Returns validated EvidenceItem[] from .nevergraph/evidence.json.
 * Validates with Zod before returning — rejects malformed persisted data.
 */

import { readEvidence } from "../persistence.js";
import type { EvidenceItem } from "@nevergraph/schemas";

export interface GetRepositoryEvidenceInput {
  workspaceRoot: string;
}

export interface GetRepositoryEvidenceOutput {
  evidence: EvidenceItem[];
  count: number;
}

export function getRepositoryEvidence(
  input: GetRepositoryEvidenceInput,
): GetRepositoryEvidenceOutput {
  const evidence = readEvidence(input.workspaceRoot);
  return { evidence, count: evidence.length };
}
