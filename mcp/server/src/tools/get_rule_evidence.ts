/**
 * get_rule_evidence.ts
 *
 * MCP tool: get_rule_evidence (optional)
 * Given a rule ID, returns the actual EvidenceItem objects referenced by it.
 * Useful for Bob to inspect the evidence supporting a specific rule.
 */

import { readRules, readEvidence } from "../persistence.js";
import type { EvidenceItem } from "@nevergraph/schemas";

export interface GetRuleEvidenceInput {
  ruleId: string;
  workspaceRoot: string;
}

export interface GetRuleEvidenceOutput {
  ruleId: string;
  evidence: EvidenceItem[];
  missingIds: string[];
}

export function getRuleEvidence(input: GetRuleEvidenceInput): GetRuleEvidenceOutput {
  const rules = readRules(input.workspaceRoot);
  const rule = rules.find((r) => r.id === input.ruleId);

  if (!rule) {
    throw new Error(`Rule "${input.ruleId}" not found in rules.json`);
  }

  const allEvidence = readEvidence(input.workspaceRoot);
  const evidenceById = new Map(allEvidence.map((e) => [e.id, e]));

  const evidence: EvidenceItem[] = [];
  const missingIds: string[] = [];

  for (const ref of rule.evidence) {
    const item = evidenceById.get(ref.evidenceId);
    if (item) {
      evidence.push(item);
    } else {
      missingIds.push(ref.evidenceId);
    }
  }

  return { ruleId: input.ruleId, evidence, missingIds };
}
