/**
 * normalizer.ts
 *
 * Converts raw extractor observations into validated EvidenceItem[] and
 * StateTransition[] conforming to @nevergraph/schemas.
 *
 * TRANSITION-PATCH SEMANTICS
 * ==========================
 * StateTransition.to.facts contains ONLY the fact keys written by the operation.
 * Unspecified keys must be interpreted by the graph engine as PRESERVED (not cleared).
 * This is intentional: an operation may write one fact while leaving unrelated
 * historical facts untouched, so the graph engine must carry those facts forward.
 *
 * MULTI-SOURCE-STATE TRANSITIONS
 * ================================
 * When a function's guard set allows multiple valid source states (e.g. PAID or REFUNDED),
 * the normalizer emits one StateTransition per allowed source state.
 *
 * ENUM DISCOVERY
 * ==============
 * The normalizer discovers which enum is the "status enum" by observing that status
 * assignments use the same enum name across functions. No enum name is hard-coded.
 */

import {
  EvidenceItem,
  EvidenceItemSchema,
  StateTransition,
  StateTransitionSchema,
  GuardSignal,
} from "@nevergraph/schemas";
import {
  RawStatusAssignment,
  RawFactAssignment,
  RawGuard,
  RawNegativeTest,
} from "./types.js";

// ---------------------------------------------------------------------------
// ID counters
// ---------------------------------------------------------------------------

let evCounter = 0;
let trCounter = 0;

function nextEvId(): string {
  evCounter += 1;
  return `ev-${String(evCounter).padStart(3, "0")}`;
}

function nextTrId(): string {
  trCounter += 1;
  return `tr-${String(trCounter).padStart(3, "0")}`;
}

function resetCounters(): void {
  evCounter = 0;
  trCounter = 0;
}

// ---------------------------------------------------------------------------
// Guard → GuardSignal
// ---------------------------------------------------------------------------

function rawGuardToSignal(g: RawGuard): GuardSignal {
  return {
    field: g.propertyName,
    operator: g.operator,
    value: g.value,
  };
}

// ---------------------------------------------------------------------------
// Transition building
// ---------------------------------------------------------------------------

interface TransitionCandidate {
  functionName: string;
  /** Required source states — empty means unknown */
  allowedFromStates: string[];
  /** The status the function transitions TO */
  toState: string;
  /** Fact key updates written by this function { key: true|null } */
  toFacts: Record<string, boolean | null>;
  /** Exact fact values required for the transition to be applicable. */
  fromFacts: Record<string, boolean | string | number | null>;
  guards: GuardSignal[];
  file: string;
  line: number;
}

/**
 * Derive transition candidates from status assignments grouped by function.
 *
 * For each function that writes entity.statusProp = Enum.MEMBER we determine:
 *   - fromStates: inferred from guards on that property in the same function
 *   - toState: the assigned enum member
 *   - toFacts: all non-status fact assignments in the same function
 */
function buildTransitionCandidates(
  statusAssignments: RawStatusAssignment[],
  factAssignments: RawFactAssignment[],
  guards: RawGuard[],
): TransitionCandidate[] {
  // Group by functionName
  const byFunction = new Map<string, {
    assignments: RawStatusAssignment[];
    facts: RawFactAssignment[];
    guards: RawGuard[];
  }>();

  for (const sa of statusAssignments) {
    const key = sa.functionName;
    if (!byFunction.has(key)) byFunction.set(key, { assignments: [], facts: [], guards: [] });
    byFunction.get(key)!.assignments.push(sa);
  }

  for (const fa of factAssignments) {
    const key = fa.functionName;
    if (!byFunction.has(key)) continue; // Only care about functions that also have status assignments
    byFunction.get(key)!.facts.push(fa);
  }

  for (const g of guards) {
    const key = g.functionName;
    if (!byFunction.has(key)) continue;
    byFunction.get(key)!.guards.push(g);
  }

  const candidates: TransitionCandidate[] = [];

  for (const [fnName, data] of byFunction) {
    // There may be multiple status assignments in one function (unlikely in Mercury but possible)
    for (const sa of data.assignments) {
      const toState = sa.enumMember;
      const statusProp = sa.propertyName;

      const relevantGuards = data.guards.filter((g) => g.objectName === sa.objectName);

      // Derive allowed from-states from guards on the same status property
      const statusGuards = relevantGuards.filter((g) => g.propertyName === statusProp);

      const allowedFromStates = deriveAllowedFromStates(statusGuards);
      const fromFacts = deriveRequiredFacts(
        relevantGuards.filter((g) => g.propertyName !== statusProp),
      );

      // Collect non-null fact assignments (exclude the status property itself)
      const toFacts: Record<string, boolean | null> = {};
      for (const fa of data.facts) {
        if (fa.propertyName === statusProp) continue;
        // Only include non-null assignments as "positive" facts written
        // null assignments during initialization are filtered later
        if (fa.value !== null) {
          toFacts[fa.propertyName] = true;
        }
        // We deliberately do NOT record null assignments here because
        // null assignments in createOrder are initialization, not lifecycle facts.
      }

      // Guard signals for provenance
      const guardSignals: GuardSignal[] = relevantGuards.map(rawGuardToSignal);

      // Determine source file + line from the status assignment
      candidates.push({
        functionName: fnName,
        allowedFromStates,
        toState,
        toFacts,
        fromFacts,
        guards: guardSignals,
        file: sa.file,
        line: sa.line,
      });
    }
  }

  return candidates;
}

/**
 * Given guards on the status property, derive the set of states that are
 * ALLOWED as source states (i.e., the states that would not trigger a throw).
 *
 * Rules:
 *   - A single `neq Enum.VALUE` guard means: source must be VALUE (only VALUE is allowed)
 *   - Multiple `neq` guards in an AND chain: source must be one of the values
 *     NOT in the rejected set. We can enumerate allowed = all_observed_enum_members - rejected.
 *     But since we don't have the full enum here, we instead store the rejected set and
 *     return an empty allowed set (UNKNOWN). The transition builder will handle this specially.
 *   - A single `eq Enum.VALUE` guard means: source must NOT be VALUE → we cannot simply
 *     enumerate from-states, so return [] (unknown) to keep it conservative.
 *
 * For Mercury specifically:
 *   - payOrder: neq CREATED  →  allowed = [CREATED]
 *   - refundOrder: neq PAID  →  allowed = [PAID]
 *   - shipOrder: neq PAID    →  allowed = [PAID]
 *   - cancelOrder has TWO guards:
 *       (1) eq SHIPPED  → throw   (simple eq guard)
 *       (2) (neq PAID && neq REFUNDED) → throw   (multi-neq AND)
 *     From guard (1) we know SHIPPED is rejected.
 *     From guard (2) we know PAID and REFUNDED are allowed (everything except PAID and REFUNDED is rejected PLUS SHIPPED).
 *     The normalizer resolves this by computing:
 *       allowed = values_seen_in_neq_guards (i.e. PAID, REFUNDED)
 */
function deriveAllowedFromStates(guards: RawGuard[]): string[] {
  if (guards.length === 0) return [];

  const neqGuards = guards.filter((g) => g.operator === "neq");
  const eqGuards = guards.filter((g) => g.operator === "eq");

  // Case: only neq guards
  if (neqGuards.length > 0 && eqGuards.length === 0) {
    if (neqGuards.length === 1) {
      const g = neqGuards[0]!;
      // Single neq: allowed = [required_value]
      return g.value === null ? [] : [g.value];
    }
    // Multiple neq: all are in additionalRejected relationship
    // The allowed states are exactly the neq values themselves
    // (the multi-neq pattern: "must be A or B, otherwise throw")
    const neqValues = new Set(
      neqGuards.flatMap((g) => g.value === null ? [] : [g.value]),
    );
    return [...neqValues].sort();
  }

  // Case: eq guard (reject-if-equals) — we cannot enumerate allowed states without the full enum
  // Fall through to: cancelOrder mixed case
  if (eqGuards.length > 0 && neqGuards.length > 0) {
    // Mixed: eq guards say "this state is rejected" (SHIPPED),
    // neq guards say "only these states are allowed" (PAID, REFUNDED)
    // We trust the neq guards to enumerate allowed states
    const neqValues = new Set(
      neqGuards.flatMap((g) => g.value === null ? [] : [g.value]),
    );
    return [...neqValues].sort();
  }

  // Only eq guards — cannot enumerate allowed states
  return [];
}

/**
 * Translate only exactly representable successful fact preconditions.
 *
 * A throwing `entity.fact !== null` guard means execution continues only when
 * the fact is exactly null. A throwing `entity.fact === null` guard means the
 * continuation is non-null; GraphState has no general non-null predicate, so
 * that case remains a provenance guard and is conservatively not encoded.
 */
function deriveRequiredFacts(
  guards: RawGuard[],
): Record<string, boolean | string | number | null> {
  const requiredFacts: Record<string, boolean | string | number | null> = {};

  for (const guard of guards) {
    if (guard.operator === "neq" && guard.value === null) {
      requiredFacts[guard.propertyName] = null;
    }
  }

  return requiredFacts;
}

// ---------------------------------------------------------------------------
// Public normalize function
// ---------------------------------------------------------------------------

export interface NormalizeResult {
  evidence: EvidenceItem[];
  transitions: StateTransition[];
}

export function normalize(
  statusAssignments: RawStatusAssignment[],
  factAssignments: RawFactAssignment[],
  guards: RawGuard[],
  negativeTests: RawNegativeTest[],
): NormalizeResult {
  resetCounters();

  const evidence: EvidenceItem[] = [];
  const transitions: StateTransition[] = [];

  // --- Guard evidence ---
  // Deduplicate: one EvidenceItem per unique (functionName, line, value) guard
  const seenGuards = new Set<string>();
  for (const g of guards) {
    const dedupeKey = `${g.functionName}:${g.line}:${g.value}`;
    if (seenGuards.has(dedupeKey)) continue;
    seenGuards.add(dedupeKey);

    const enumRef = g.value === null
      ? "null"
      : g.enumName
        ? `${g.enumName}.${g.value}`
        : g.value;
    const opText = g.operator === "neq" ? "!==" : "===";
    const snippet = `if (${g.subject} ${opText} ${enumRef}) { throw new ${g.throwsClass ?? "Error"}(...) }`;
    const summary = `Guard in ${g.functionName}: ${g.subject} ${opText} ${enumRef} → throw`;

    const item = EvidenceItemSchema.parse({
      id: nextEvId(),
      type: "guard",
      file: g.file,
      line: g.line,
      symbol: g.functionName,
      snippet,
      summary,
      metadata: {
        operator: g.operator,
        property: g.propertyName,
        value: g.value,
        enumName: g.enumName,
        throwsClass: g.throwsClass,
        additionalRejected: g.additionalRejected,
      },
    });
    evidence.push(item);
  }

  // --- Throw evidence ---
  // Derive throw evidence from guards that have throws (already captured in guard evidence)
  // Emit a separate "throw" evidence item per unique error class per function
  const seenThrows = new Set<string>();
  for (const g of guards) {
    if (!g.throws || !g.throwsClass) continue;
    const key = `${g.functionName}:${g.throwsClass}`;
    if (seenThrows.has(key)) continue;
    seenThrows.add(key);

    const item = EvidenceItemSchema.parse({
      id: nextEvId(),
      type: "throw",
      file: g.file,
      line: g.line,
      symbol: g.functionName,
      snippet: `throw new ${g.throwsClass}(...)`,
      summary: `${g.functionName} throws ${g.throwsClass} on invalid transition`,
      metadata: {
        errorClass: g.throwsClass,
        functionName: g.functionName,
      },
    });
    evidence.push(item);
  }

  // --- State transition evidence ---
  for (const sa of statusAssignments) {
    const item = EvidenceItemSchema.parse({
      id: nextEvId(),
      type: "state_transition",
      file: sa.file,
      line: sa.line,
      symbol: sa.functionName,
      snippet: `${sa.objectName}.${sa.propertyName} = ${sa.enumName}.${sa.enumMember}`,
      summary: `${sa.functionName} assigns status ${sa.enumMember}`,
      metadata: {
        objectName: sa.objectName,
        propertyName: sa.propertyName,
        enumName: sa.enumName,
        enumMember: sa.enumMember,
      },
    });
    evidence.push(item);
  }

  // --- Negative test evidence ---
  for (const nt of negativeTests) {
    if (!nt.expectsThrow) continue;
    const opText = nt.testedOperation ? `${nt.testedOperation}()` : "<operation>";
    const statesText = nt.referencedStates.length > 0
      ? ` [states: ${nt.referencedStates.join(", ")}]`
      : "";
    const item = EvidenceItemSchema.parse({
      id: nextEvId(),
      type: "negative_test",
      file: nt.file,
      line: nt.line,
      symbol: nt.suiteName || nt.testName,
      snippet: `expect(() => ${opText}).toThrow()`,
      summary: `Negative test: "${nt.testName}"${statesText}`,
      metadata: {
        suiteName: nt.suiteName,
        testName: nt.testName,
        testedOperation: nt.testedOperation,
        referencedStates: nt.referencedStates,
      },
    });
    evidence.push(item);
  }

  // --- Build StateTransitions ---
  const candidates = buildTransitionCandidates(statusAssignments, factAssignments, guards);

  for (const cand of candidates) {
    const fromStates = cand.allowedFromStates.length > 0
      ? cand.allowedFromStates
      : ["UNKNOWN"];

    for (const fromState of fromStates) {
      const tr = StateTransitionSchema.parse({
        id: nextTrId(),
        action: cand.functionName,
        from: {
          state: fromState,
          facts: cand.fromFacts,
        },
        to: {
          state: cand.toState,
          facts: cand.toFacts,
        },
        file: cand.file,
        line: cand.line,
        guards: cand.guards,
      });
      transitions.push(tr);
    }
  }

  // Sort for deterministic output
  evidence.sort((a, b) => {
    const fileCmp = a.file.localeCompare(b.file);
    if (fileCmp !== 0) return fileCmp;
    return a.line - b.line;
  });

  transitions.sort((a, b) => {
    const actCmp = a.action.localeCompare(b.action);
    if (actCmp !== 0) return actCmp;
    return a.from.state.localeCompare(b.from.state);
  });

  // Re-assign IDs after sorting to keep them stable relative to sort order
  resetCounters();
  for (const ev of evidence) {
    (ev as any).id = nextEvId();
  }
  for (const tr of transitions) {
    (tr as any).id = nextTrId();
  }

  return { evidence, transitions };
}
