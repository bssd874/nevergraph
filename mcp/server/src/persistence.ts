/**
 * persistence.ts
 *
 * Read/write validated NeverGraph artifacts from .nevergraph/.
 *
 * Rules are only persisted after:
 *  1. Structural JSON parsing
 *  2. Zod schema validation (NeverRuleSchema)
 *  3. Evidence-reference validation (every evidenceId must exist)
 *  4. Confidence/evidence-category policy enforcement
 *
 * The pipeline fails closed — invalid or hallucinated output is rejected
 * before any write occurs.
 *
 * This module does NOT contain any predetermined Mercury rules or semantic
 * answers. It validates whatever Bob synthesizes.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import {
  EvidenceItemSchema,
  NeverRuleSchema,
  StateTransitionSchema,
  type EvidenceItem,
  type NeverRule,
  type StateTransition,
} from "@nevergraph/schemas";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

function nevergraphDir(workspaceRoot: string): string {
  return path.resolve(workspaceRoot, ".nevergraph");
}

function artifactPath(workspaceRoot: string, filename: string): string {
  return path.join(nevergraphDir(workspaceRoot), filename);
}

// ---------------------------------------------------------------------------
// Safe JSON file reader
// ---------------------------------------------------------------------------

function readJsonFile(filePath: string): unknown {
  if (!existsSync(filePath)) return [];
  const raw = readFileSync(filePath, "utf-8");
  return JSON.parse(raw);
}

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

const EvidenceArraySchema = z.array(EvidenceItemSchema);

export function readEvidence(workspaceRoot: string): EvidenceItem[] {
  const raw = readJsonFile(artifactPath(workspaceRoot, "evidence.json"));
  return EvidenceArraySchema.parse(raw);
}

// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------

const TransitionArraySchema = z.array(StateTransitionSchema);

export function readTransitions(workspaceRoot: string): StateTransition[] {
  const raw = readJsonFile(artifactPath(workspaceRoot, "transitions.json"));
  return TransitionArraySchema.parse(raw);
}

// ---------------------------------------------------------------------------
// Rules — read
// ---------------------------------------------------------------------------

const RulesArraySchema = z.array(NeverRuleSchema);

export function readRules(workspaceRoot: string): NeverRule[] {
  const raw = readJsonFile(artifactPath(workspaceRoot, "rules.json"));
  return RulesArraySchema.parse(raw);
}

/**
 * Read rules through the full deterministic trust boundary.
 *
 * Persisted rules are not trusted solely because they still match the Zod
 * shape. Their evidence references, confidence, and assigned IDs must also
 * remain valid against the current evidence artifact.
 */
export function readValidatedRules(workspaceRoot: string): NeverRule[] {
  const rules = readRules(workspaceRoot);
  if (rules.length === 0) return rules;

  const evidence = readEvidence(workspaceRoot);
  const { valid, errors } = validateSynthesizedRules(rules, evidence);

  if (errors.length > 0 || valid.length !== rules.length) {
    const reasons = errors.map((error) => error.reason).join("; ");
    throw new Error(`persisted rules failed evidence validation: ${reasons}`);
  }

  const confidenceMismatch = rules.find(
    (rule, index) => valid[index]?.confidence !== rule.confidence,
  );
  if (confidenceMismatch) {
    throw new Error(
      `persisted rule "${confidenceMismatch.id}" exceeds the deterministic confidence policy`,
    );
  }

  assertDeterministicRuleIds(rules);
  return rules;
}

// ---------------------------------------------------------------------------
// Synthesis validation contract
// ---------------------------------------------------------------------------

/**
 * Count the number of distinct evidence-type categories cited in a rule.
 * Uses real EvidenceItem data — the caller must supply the full evidence set.
 */
function countEvidenceCategories(rule: NeverRule, evidence: EvidenceItem[]): number {
  const evidenceById = new Map(evidence.map((e) => [e.id, e]));
  const categories = new Set<string>();
  for (const ref of rule.evidence) {
    const item = evidenceById.get(ref.evidenceId);
    if (item) categories.add(item.type);
  }
  return categories.size;
}

/**
 * Deterministic confidence policy.
 * The model may propose a confidence level, but this policy may lower it
 * based on actual independent evidence categories.
 *
 * Policy:
 *   1 category  → "low"
 *   2 categories → "medium" (at most)
 *   3+ categories → "high" (allowed)
 */
function enforcedConfidence(
  proposed: NeverRule["confidence"],
  categoryCount: number,
): NeverRule["confidence"] {
  if (categoryCount >= 3) return proposed; // HIGH allowed; lower also fine
  if (categoryCount === 2) {
    // Only "low" or "medium" allowed
    return proposed === "high" ? "medium" : proposed;
  }
  // 0 or 1 category → forced "low"
  return "low";
}

export interface SynthesisValidationError {
  ruleIndex: number;
  reason: string;
}

export interface SynthesisValidationResult {
  valid: NeverRule[];
  errors: SynthesisValidationError[];
}

/**
 * Validate a raw array of candidate rules from Bob synthesis.
 *
 * Steps:
 *  1. Parse each candidate with NeverRuleSchema (Zod).
 *  2. Verify every evidenceId exists in the supplied evidence set.
 *  3. Cap confidence per deterministic policy.
 *
 * Returns only structurally and semantically valid rules.
 * Does not silently coerce malformed output — errors are reported.
 */
export function validateSynthesizedRules(
  rawCandidates: unknown,
  evidence: EvidenceItem[],
): SynthesisValidationResult {
  const parsedEvidence = EvidenceArraySchema.safeParse(evidence);
  if (!parsedEvidence.success) {
    return {
      valid: [],
      errors: [{
        ruleIndex: -1,
        reason: `evidence validation failed: ${parsedEvidence.error.message}`,
      }],
    };
  }

  if (!Array.isArray(rawCandidates)) {
    return {
      valid: [],
      errors: [{ ruleIndex: -1, reason: "synthesized output must be a JSON array" }],
    };
  }

  const validatedEvidence = parsedEvidence.data;
  const evidenceById = new Map(validatedEvidence.map((item) => [item.id, item]));
  const valid: NeverRule[] = [];
  const errors: SynthesisValidationError[] = [];

  for (let i = 0; i < rawCandidates.length; i++) {
    const candidate = rawCandidates[i];

    // Step 1: Zod structural validation
    const parsed = NeverRuleSchema.safeParse(candidate);
    if (!parsed.success) {
      errors.push({
        ruleIndex: i,
        reason: `Zod validation failed: ${parsed.error.message}`,
      });
      continue;
    }

    const rule = parsed.data;

    // Step 2: Evidence-reference validation — reject hallucinated IDs
    const unknownRefs = rule.evidence.filter((ref) => !evidenceById.has(ref.evidenceId));
    if (unknownRefs.length > 0) {
      errors.push({
        ruleIndex: i,
        reason: `hallucinated evidence references: ${unknownRefs.map((r) => r.evidenceId).join(", ")}`,
      });
      continue;
    }

    const mismatchedRefs = rule.evidence.filter((ref) => {
      const item = evidenceById.get(ref.evidenceId);
      return item !== undefined && (item.file !== ref.file || item.line !== ref.line);
    });
    if (mismatchedRefs.length > 0) {
      errors.push({
        ruleIndex: i,
        reason: `evidence reference location mismatch: ${mismatchedRefs.map((r) => r.evidenceId).join(", ")}`,
      });
      continue;
    }

    // Step 3: Confidence policy enforcement
    const categoryCount = countEvidenceCategories(rule, validatedEvidence);
    const capped = enforcedConfidence(rule.confidence, categoryCount);
    const finalRule: NeverRule = capped !== rule.confidence
      ? { ...rule, confidence: capped }
      : rule;

    valid.push(finalRule);
  }

  return { valid, errors };
}

// ---------------------------------------------------------------------------
// Deterministic rule-ID assignment
// ---------------------------------------------------------------------------

/**
 * Sort candidate rules by a stable normalized key and assign NEVER-001,
 * NEVER-002, ... in that order.
 *
 * Sort key: targetState + alphabetically sorted requiredFacts keys/values +
 * lowercased description words (alphabetically sorted).
 *
 * This is deterministic given the same input and does not encode semantic
 * meaning into any particular ID number.
 */
export function assignRuleIds(rules: NeverRule[]): NeverRule[] {
  function sortKey(rule: NeverRule): string {
    const fc = rule.forbiddenCondition;
    const factsKey = Object.keys(fc.requiredFacts)
      .sort()
      .map((k) => `${k}=${String(fc.requiredFacts[k])}`)
      .join("|");
    const descKey = rule.description
      .toLowerCase()
      .split(/\W+/)
      .filter(Boolean)
      .sort()
      .join("|");
    return `${fc.targetState}|${factsKey}|${descKey}`;
  }

  const sorted = [...rules].sort((a, b) => {
    const ka = sortKey(a);
    const kb = sortKey(b);
    if (ka < kb) return -1;
    if (ka > kb) return 1;
    return compareStrings(ruleContentKey(a), ruleContentKey(b));
  });

  return sorted.map((rule, i) => ({
    ...rule,
    id: `NEVER-${String(i + 1).padStart(3, "0")}`,
  }));
}

function assertDeterministicRuleIds(rules: NeverRule[]): void {
  const actual = rules
    .map((rule) => ({ id: rule.id, content: ruleContentKey(rule) }))
    .sort(compareRuleIdentity);
  const expected = assignRuleIds(rules)
    .map((rule) => ({ id: rule.id, content: ruleContentKey(rule) }))
    .sort(compareRuleIdentity);

  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error("persisted rule IDs do not match deterministic assignment");
  }
}

function compareRuleIdentity(
  left: { id: string; content: string },
  right: { id: string; content: string },
): number {
  const contentComparison = compareStrings(left.content, right.content);
  return contentComparison === 0 ? compareStrings(left.id, right.id) : contentComparison;
}

function compareStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function ruleContentKey(rule: NeverRule): string {
  const requiredFacts = Object.fromEntries(
    Object.entries(rule.forbiddenCondition.requiredFacts).sort(([left], [right]) =>
      compareStrings(left, right)
    ),
  );
  const evidence = [...rule.evidence].sort((left, right) => {
    const idComparison = compareStrings(left.evidenceId, right.evidenceId);
    if (idComparison !== 0) return idComparison;
    const fileComparison = compareStrings(left.file, right.file);
    return fileComparison !== 0 ? fileComparison : left.line - right.line;
  });

  return JSON.stringify({
    description: rule.description,
    confidence: rule.confidence,
    forbiddenCondition: {
      targetState: rule.forbiddenCondition.targetState,
      requiredFacts,
    },
    evidence,
  });
}

// ---------------------------------------------------------------------------
// Rule persistence
// ---------------------------------------------------------------------------

/**
 * Persist validated rules to .nevergraph/rules.json.
 *
 * Validates before write. Throws if the final array is invalid.
 */
export function persistRules(rules: NeverRule[], workspaceRoot: string): void {
  // Final validation gate before write
  RulesArraySchema.parse(rules);

  const dir = nevergraphDir(workspaceRoot);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, "rules.json"),
    JSON.stringify(rules, null, 2) + "\n",
    "utf-8",
  );
}

/**
 * Full synthesis pipeline:
 *
 *  rawBobOutput (unknown)
 *    → validateSynthesizedRules (Zod + evidence-ref + confidence policy)
 *    → assignRuleIds (deterministic ID assignment)
 *    → persistRules (final Zod gate + write)
 *
 * Returns the validated and persisted rules, or throws with a descriptive
 * error if any validation step fails. Does NOT silently coerce bad output.
 */
export function runSynthesisPipeline(
  rawBobOutput: unknown,
  evidence: EvidenceItem[],
  workspaceRoot: string,
): { rules: NeverRule[]; errors: SynthesisValidationError[] } {
  const { valid, errors } = validateSynthesizedRules(rawBobOutput, evidence);

  if (valid.length === 0 && errors.length > 0) {
    // All candidates failed — return errors without writing
    return { rules: [], errors };
  }

  const withIds = assignRuleIds(valid);
  persistRules(withIds, workspaceRoot);

  return { rules: withIds, errors };
}
