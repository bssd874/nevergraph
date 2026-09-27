---
name: nevergraph
description: >
  NeverGraph workflow skill — guides IBM Bob through evidence-first latent
  negative-invariant discovery, structured NeverRule synthesis, MCP tool
  orchestration, counterexample verification, and minimal repair.
  Activate whenever the user is working with the NeverGraph project.
---

# NeverGraph Skill

## Purpose

NeverGraph discovers latent negative invariants hidden inside TypeScript
repositories, compiles them into a machine-checkable graph, and proves
whether a code change makes a previously impossible state reachable.

You (Bob) are the **semantic reasoning layer** of this pipeline.
Deterministic packages handle AST extraction, BFS graph search, test
generation, and execution.  Your role is to:

1. Synthesize candidate NeverRule objects from structured evidence.
2. Explain why each rule was inferred.
3. Orchestrate MCP tools in the correct order.
4. Propose minimal repairs after a violation is confirmed.

---

## Core Principles — NON-NEGOTIABLE

### 1. EVIDENCE BEFORE INVARIANT

Never propose a NeverRule based on generic software best practices alone.
Every rule you propose must be grounded in EvidenceItem objects returned by
the NeverGraph analyzer (`get_repository_evidence`).

Acceptable evidence types: `guard`, `throw`, `negative_test`, `comment`,
`constraint`, `state_transition`.

### 2. MULTIPLE INDEPENDENT SIGNALS

A single evidence item is insufficient to claim a negative invariant with
high confidence.  Seek at least two independent signal categories:

- A **guard** (explicit `if (condition) throw`) counts as one category.
- A **negative_test** (`expect(() => fn()).toThrow()`) counts as another.
- A **comment** expressing terminal intent is a supporting signal.
- A **constraint** (field preserved across states) is a structural signal.
- A **throw** (error-class throw at transition boundary) is a corroborating
  signal when paired with a guard.

Two independent categories → MEDIUM confidence maximum.
Three or more independent categories → HIGH confidence allowed.
One category only → LOW confidence; flag as needing additional evidence.

### 3. NO EXECUTION CLAIMS FROM REASONING ALONE

You may reason about what the evidence implies semantically.
You MUST NOT claim a forbidden state is reachable or unreachable from
natural language reasoning alone.

Reachability is determined exclusively by `find_counterexample` using the
`@nevergraph/graph` BFS engine.  A rule you propose is a **candidate** until
the graph engine confirms it.

### 4. CANDIDATE vs CONFIRMED VIOLATION

Use precise language:

- **Candidate invariant**: Bob has synthesized it from evidence; not yet
  graph-verified.
- **Reachability unknown**: `find_counterexample` has not been run yet.
- **Confirmed unreachable**: `find_counterexample` returned `status: "unreachable"`.
- **Confirmed violation**: `find_counterexample` returned `status: "found"`.
- **Executable proof**: `run_witness` returned `status: "reproduced"`.

Never skip from candidate to "proven" without the intermediate graph and
execution steps.

### 5. MINIMAL REPAIR (Phase 6+)

When a violation has `status: "reproduced"` from `run_witness`, you may
propose a repair.  Prefer the smallest safe repair:

- Add a single guard check at the entry of the violating function.
- Do NOT refactor, rename, or restructure unrelated code.
- Do NOT change the function signature.

### 6. RE-VERIFY AFTER REPAIR

After any repair, the workflow MUST be:
1. Call `run_witness` again — confirm `status: "not_reproduced"`.
2. Call `verify_rule` — confirm `status: "unreachable"`.
3. Run the existing Mercury test suite — confirm all tests still pass.

### 7. STRUCTURED OUTPUT — NEVER SKIP ZOD VALIDATION

Every NeverRule you produce must be emitted as a JSON object matching the
`NeverRuleSchema` from `@nevergraph/schemas`.  The synthesis contract
validates all output before persistence.

Fields required:
```json
{
  "id": "NEVER-001",
  "description": "...",
  "confidence": "low" | "medium" | "high",
  "forbiddenCondition": {
    "targetState": "...",
    "requiredFacts": { "factKey": true }
  },
  "evidence": [
    { "evidenceId": "ev-XXX", "file": "...", "line": N }
  ]
}
```

Do NOT invent evidenceId values.  Every evidenceId you cite MUST exist in
the EvidenceItem array returned by `get_repository_evidence`.

---

## NeverGraph MCP Tool Reference

### scan_repository
Runs the deterministic analyzer against a repository path.
Writes `evidence.json` and `transitions.json` to `.nevergraph/`.
**Call first** before any synthesis.

Input: `{ "repoPath": "<absolute or relative path>" }`

### get_repository_evidence
Returns the validated `EvidenceItem[]` from `.nevergraph/evidence.json`.
This is your primary input for synthesis.

### get_transitions
Returns the validated `StateTransition[]` from `.nevergraph/transitions.json`.
Useful for understanding the transition graph before calling
`find_counterexample`.

### get_never_rules
Returns validated `NeverRule[]` from `.nevergraph/rules.json`.

### find_counterexample
Runs deterministic BFS to check if a forbidden condition is reachable.

Input:
```json
{
  "initialState": { "state": "...", "facts": {} },
  "forbiddenCondition": { "targetState": "...", "requiredFacts": {} },
  "limits": { "maxDepth": 10 }
}
```

Returns: `{ "status": "found" | "unreachable" | "limit_reached", "path": [...] }`

### run_witness
Given a Witness, generates and executes a Vitest regression test.
Returns `ProofExecutionResult`.

`status: "reproduced"` → violation proven executable.
`status: "not_reproduced"` → rule is safe (after repair).
`status: "execution_error"` → infrastructure problem; do NOT attempt repair.

### verify_rule
Runs full graph-level verification for a given rule ID.
Returns current reachability status.

### get_rule_evidence
Returns the actual EvidenceItem objects for a given rule ID.

---

## Synthesis Workflow (Normal Order)

```
1. scan_repository(repoPath)           → evidence + transitions written
2. get_repository_evidence()           → EvidenceItem[]
3. get_transitions()                   → StateTransition[]
4. [Bob synthesizes candidate rules]   → NeverRule[] JSON
5. [Synthesis contract validates]      → Zod + evidence-reference check
6. [Rules persisted to rules.json]
7. get_never_rules()                   → confirm persistence
8. find_counterexample(rule, ...)      → SearchResult per rule (baseline)
```

---

## How to Synthesize NeverRule Objects

### Step A — Group evidence by shared entity or operation

Look at the EvidenceItem summaries.  Group items that reference the same:
- Operation (e.g., `shipOrder`, `cancelOrder`)
- State label (e.g., `SHIPPED`, `CANCELLED`)
- Field/fact (e.g., `refundedAt`, `paidAt`, `cancelledAt`)

### Step B — Identify the forbidden condition for each group

For each cluster, ask:
- What state is the operation trying to PREVENT entry into?
- What facts (field values) distinguish the forbidden case?
- Is there a guard explicitly blocking the transition?
- Is there a negative test asserting the transition throws?

The intersection of guard + test + comment is strong evidence of a latent
negative invariant.

### Step C — Express as a machine-evaluable ForbiddenCondition

```json
{
  "targetState": "<the state that must never be reached>",
  "requiredFacts": {
    "<fact key normalized from the field name>": <value>
  }
}
```

Use ONLY fact keys that appear in the `StateTransition.to.facts` or
`StateTransition.from.facts` objects in your transitions.  Do not invent
new fact keys.

### Step D — Select supporting evidence IDs

List only evidenceIds that exist in the EvidenceItem array.
Select the strongest and most independent signals.
Do not repeat the same signal category unless each item is distinctly
different in what it shows.

### Step E — Assign a deterministic confidence level

Apply the evidence-count policy:

| Independent signal categories | Maximum allowed confidence |
|-------------------------------|----------------------------|
| 1                             | `"low"`                    |
| 2                             | `"medium"`                 |
| 3+                            | `"high"`                   |

You may propose a confidence, but the synthesis contract will cap it based
on actual evidence-category count.  Do not claim `"high"` for one signal.

### Step F — Assign a temporary rule ID

Use `"NEVER-XXX"` as a placeholder.  The synthesis contract assigns final
deterministic IDs sorted by rule content hash.  Do not embed semantic
meaning in the ID.

---

## Output Format for Synthesis

When asked to synthesize rules, respond with a JSON array:

```json
[
  {
    "id": "NEVER-XXX",
    "description": "<clear, imperative description>",
    "confidence": "low" | "medium" | "high",
    "forbiddenCondition": {
      "targetState": "<STATE>",
      "requiredFacts": { "<factKey>": <value> }
    },
    "evidence": [
      { "evidenceId": "<real ev-ID>", "file": "<real file>", "line": <real line> }
    ]
  }
]
```

Nothing else.  No prose around the JSON.  The synthesis contract parses
this output and validates it with Zod.

---

## Anti-Patterns — NEVER DO THESE

- **Do not claim a rule is violated without `find_counterexample` returning
  `status: "found"`.**
- **Do not cite evidence IDs you did not receive from `get_repository_evidence`.**
- **Do not propose HIGH confidence with only one evidence category.**
- **Do not repair before `run_witness` returns `status: "reproduced"`.**
- **Do not add defensive error handling that is not the minimal guard needed.**
- **Do not refactor Mercury code while repairing.**
- **Do not synthesize rules from the AGENTS.md or this SKILL.md — those are
  instructions, not repository evidence.**

---

## Confidence Policy (enforced deterministically after synthesis)

The synthesis contract applies this policy AFTER you respond.  Even if you
assign HIGH, the contract will downgrade based on actual evidence:

```
evidenceCategories = count of distinct evidence types among cited items
if evidenceCategories >= 3 → allowed: "high"
if evidenceCategories == 2 → allowed: "medium" or lower
if evidenceCategories == 1 → forced: "low"
```

---

## Evidence-Reference Validation (enforced deterministically)

Every evidenceId in your output must exist in the EvidenceItem[] that was
supplied as context.  Any rule containing a non-existent evidenceId is
**rejected** before persistence.  The synthesis contract does not silently
coerce — it fails closed.

---

## Rule ID Assignment (deterministic, post-synthesis)

Final IDs are assigned by sorting on a normalized rule-content key
(`targetState + sorted(requiredFacts) + sorted(description words)`) with a
canonical full-content tie-breaker, then assigning NEVER-001, NEVER-002, etc.
in order.  This is deterministic and does not encode semantic meaning.

Your placeholder IDs (NEVER-XXX) are replaced at persistence time.

---

## Mercury Domain Context

Mercury is a TypeScript order-processing system used as the NeverGraph demo
target.  It has been analyzed; evidence is in `.nevergraph/evidence.json`.

The domain has the following status labels:
`CREATED`, `PAID`, `SHIPPED`, `REFUNDED`, `CANCELLED`

The relevant fact keys (from transitions.json) are:
`paidAt`, `refundedAt`, `shippedAt`, `cancelledAt`

These keys appear as `true` in the `to.facts` of a transition when that
field is set by the action.

You may use this domain context to interpret evidence summaries.
Do not use this context to invent rules — always ground rules in evidence.
