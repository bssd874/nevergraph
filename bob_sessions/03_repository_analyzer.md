# IBM Bob Session Evidence — NeverGraph Phase 2

**Project:** NeverGraph  
**Hackathon:** IBM Bob 2.0 Hackathon 2026  
**Session Type:** IBM Bob — Agent Mode  
**Evidence ID:** `03_repository_analyzer`  
**Date:** 2026-09-26  
**Phase:** PHASE 2 — Deterministic TypeScript Repository Analyzer  
**Status:** Completed and approved for commit

---

## 1. Session Goal

This IBM Bob session implemented the first deterministic analysis layer of NeverGraph.

The goal of Phase 2 was to create:

```text
packages/analyzer/
```

as an independent TypeScript package that reads an ordinary TypeScript repository with `ts-morph` and emits structured, schema-validated observations.

The analyzer's responsibility is intentionally narrow:

```text
TypeScript repository
        ↓
AST inspection
        ↓
structured evidence
        +
structured lifecycle transitions
```

It does **not** infer Never Rules, perform semantic invariant synthesis, execute graph search, generate witnesses, or repair code.

Those responsibilities belong to later phases.

---

## 2. Core Architectural Boundary

Phase 2 locked an important NeverGraph design principle:

> The analyzer produces facts, not conclusions.

The approved pipeline is:

```text
repository source
        ↓
deterministic ts-morph extraction
        ↓
EvidenceItem[]
StateTransition[]
        ↓
Zod validation
        ↓
.nevergraph/evidence.json
.nevergraph/transitions.json
```

The analyzer must not emit semantic conclusions such as:

```text
"A refunded order must never become shipped."
```

IBM Bob will synthesize candidate negative invariants from these facts in a later phase.

---

## 3. Package Created

IBM Bob created:

```text
packages/analyzer/
```

with package name:

```text
@nevergraph/analyzer
```

Primary dependencies:

- `ts-morph`
- `@nevergraph/schemas`
- TypeScript
- Vitest
- Node type declarations

The analyzer has no runtime dependency on:

```text
@nevergraph/mercury
```

Mercury is supplied only as a repository path during integration testing and analysis.

---

## 4. Main Analyzer Components

The package was separated into focused deterministic modules:

```text
packages/analyzer/
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── src/
    ├── types.ts
    ├── scanner.ts
    ├── normalizer.ts
    ├── persist.ts
    ├── index.ts
    ├── cli.ts
    ├── extractors/
    │   ├── assignments.ts
    │   ├── guards.ts
    │   └── tests.ts
    └── __tests__/
        ├── fixtures.unit.test.ts
        └── mercury.integration.test.ts
```

### Responsibilities

`scanner.ts`

- walks the target repository;
- builds `ts-morph` projects;
- dispatches syntax nodes to supported extractors.

`extractors/assignments.ts`

- detects direct state assignments;
- detects direct lifecycle fact assignments.

`extractors/guards.ts`

- detects supported guard expressions;
- captures guarded property, operator, values, thrown error, and provenance.

`extractors/tests.ts`

- detects supported negative Vitest assertions.

`normalizer.ts`

- converts raw observations into shared `EvidenceItem[]`;
- constructs `StateTransition[]`;
- expands supported multi-source-state transitions.

`persist.ts`

- validates analyzer output with `@nevergraph/schemas`;
- persists validated JSON only.

`index.ts`

- exposes the deterministic repository-analysis API.

`cli.ts`

- provides a minimal command-line entry point.

---

## 5. Supported MVP Grammar

IBM Bob implemented a deliberately constrained TypeScript grammar rather than attempting full symbolic execution.

Supported patterns include:

### Direct state assignment

```ts
entity.prop = Enum.MEMBER;
```

### Lifecycle fact assignment

```ts
entity.prop = new Date();
entity.prop = true;
entity.prop = false;
entity.prop = null;
```

Non-null lifecycle-fact presence is normalized deterministically.

### Simple inequality guard

```ts
if (entity.prop !== Enum.VALUE) {
  throw new SomeError();
}
```

### Simple equality rejection guard

```ts
if (entity.prop === Enum.VALUE) {
  throw new SomeError();
}
```

### Multiple allowed states

```ts
if (
  entity.prop !== Enum.A &&
  entity.prop !== Enum.B
) {
  throw new SomeError();
}
```

This can be normalized into separate allowed source-state transitions.

### Supported negative Vitest form

```ts
expect(() => operation(arg)).toThrow(...)
```

inside normal `it()` / `test()` test structures.

---

## 6. Explicitly Unsupported Syntax

Unsupported constructs are safely ignored rather than guessed.

Current unsupported examples include:

```text
OR (`||`) guard chains
negated nested expressions
truthy/falsy property guards
await-based negative-test expressions
general symbolic conditions
```

For example:

```ts
if (order.refundedAt) {
  ...
}
```

is not currently part of the supported grammar.

This does not block the Mercury baseline because its golden behavior is intentionally encoded through lifecycle semantics rather than a `refundedAt` guard.

---

## 7. Transition Patch Semantics

Phase 2 established the state-transition contract needed by the future graph engine.

A transition uses the generic shared model:

```text
from: GraphState
to: GraphState
```

where each graph state contains:

```text
state
facts
```

The important interpretation is:

> `to.facts` contains fact updates performed by the transition, not a full replacement snapshot.

Therefore facts omitted from `to.facts` must be preserved by the graph engine.

Example extracted refund transition:

```json
{
  "action": "refundOrder",
  "from": {
    "state": "PAID",
    "facts": {}
  },
  "to": {
    "state": "REFUNDED",
    "facts": {
      "refundedAt": true
    }
  }
}
```

Example extracted cancellation transition:

```json
{
  "action": "cancelOrder",
  "from": {
    "state": "REFUNDED",
    "facts": {}
  },
  "to": {
    "state": "CANCELLED",
    "facts": {
      "cancelledAt": true
    }
  }
}
```

Because the cancellation transition does not assign `refundedAt`, the future graph engine must preserve the existing refund fact.

This is essential to NeverGraph's context-aware state model.

---

## 8. Mercury Evidence Extracted

The real Phase 2 analyzer execution against `demo/mercury/` produced:

| Evidence Type | Count |
|---|---:|
| `negative_test` | 14 |
| `guard` | 6 |
| `throw` | 4 |
| `state_transition` | 4 |
| **Total** | **28** |

These are analyzer-generated observations from real Mercury source and tests.

No NeverRule was generated.

---

## 9. Mercury Transitions Extracted

The analyzer derived the five intended Mercury baseline transitions:

| Action | From | To | Fact updates |
|---|---|---|---|
| `payOrder` | CREATED | PAID | `paidAt: true` |
| `refundOrder` | PAID | REFUNDED | `refundedAt: true` |
| `cancelOrder` | PAID | CANCELLED | `cancelledAt: true` |
| `cancelOrder` | REFUNDED | CANCELLED | `cancelledAt: true` |
| `shipOrder` | PAID | SHIPPED | `shippedAt: true` |

These transitions were derived from AST patterns rather than hard-coded Mercury answers.

---

## 10. Representative Real Evidence

### Guard evidence

The analyzer produced structured guard evidence from `payOrder`, including:

```text
symbol: payOrder
property: status
operator: neq
value: CREATED
throwsClass: InvalidOrderTransitionError
```

with real source file and line provenance.

### State-transition evidence

The analyzer observed the direct assignment:

```ts
order.status = OrderStatus.PAID;
```

inside `payOrder` and normalized it as structured transition evidence.

### Negative-test evidence

The analyzer detected supported Vitest assertions such as the test named:

```text
rejects payment of a REFUNDED order
```

and recorded the tested operation and source provenance.

The analyzer stores the test name as raw evidence rather than performing semantic NLP inference from it.

---

## 11. Critical Golden-Path Observation

The most important Phase 2 result for NeverGraph's future state exploration is:

```text
PAID → REFUNDED
```

produces the fact update:

```text
refundedAt: true
```

while:

```text
REFUNDED → CANCELLED
```

produces only:

```text
cancelledAt: true
```

and does **not** clear `refundedAt`.

Therefore a future graph execution must evolve the state as:

```text
PAID
facts: { ... }

    ↓ refund

REFUNDED
facts: {
  refundedAt: true
}

    ↓ cancel

CANCELLED
facts: {
  refundedAt: true,
  cancelledAt: true
}
```

This is the deterministic foundation for the later golden regression:

```text
CANCELLED
   ↓ restore
PAID + refundedAt=true
   ↓ ship
SHIPPED + refundedAt=true
```

---

## 12. Validation and Persistence

All analyzer output is validated against:

```text
@nevergraph/schemas
```

before persistence.

The CLI writes:

```text
.nevergraph/evidence.json
.nevergraph/transitions.json
```

Only validated structured data may be persisted.

Output ordering is deterministic so repeated analysis of an unchanged repository produces stable JSON.

---

## 13. Testing Strategy

IBM Bob implemented two layers of analyzer testing.

### Level 1 — Generic Synthetic Fixtures

```text
16 tests
```

These use names unrelated to Mercury where practical and demonstrate that extraction logic is based on syntax patterns rather than specific Mercury filenames/functions.

Coverage includes:

- direct state assignment;
- simple guards;
- equality rejection;
- multi-state guards;
- thrown errors;
- lifecycle facts;
- unsupported syntax safe-ignore behavior.

### Level 2 — Mercury Integration

```text
22 tests
```

These run the actual analyzer against:

```text
demo/mercury/
```

and verify the real extracted structure.

---

## 14. Full Regression Verification

After Phase 2 implementation:

```text
Analyzer unit tests          16 / 16 PASS
Analyzer integration tests   22 / 22 PASS
Schema tests                 71 / 71 PASS
Mercury tests                34 / 34 PASS
```

Total:

```text
143 / 143 PASS
```

No existing Phase 0 or Phase 1 behavior regressed.

---

## 15. Commands Verified

IBM Bob successfully executed the Phase 2 verification workflow, including:

```bash
pnpm install

pnpm --filter @nevergraph/schemas build

pnpm --filter @nevergraph/analyzer build

pnpm --filter @nevergraph/analyzer typecheck

pnpm --filter @nevergraph/analyzer test

pnpm run analyze:mercury

pnpm --filter @nevergraph/schemas test

pnpm --filter @nevergraph/mercury test
```

All required commands exited successfully.

A root convenience command was used for Mercury analysis because package-filter execution changes the working directory and makes a simple `demo/mercury` relative path ambiguous.

---

## 16. Anti-Hardcoding Verification

The Phase 2 implementation contains no:

```text
NEVER IDs
predefined Mercury business rules
hard-coded golden witness
runtime dependency on Mercury
filename-to-rule mapping
Mercury-path special case
```

Mercury functions and transitions appear in integration-test expectations because they are the expected output of analyzing the real test repository, not because the production analyzer special-cases them.

---

## 17. Phase 2 Acceptance Outcome

All Phase 2 acceptance criteria passed, including:

```text
Independent analyzer package                PASS
ts-morph AST inspection                     PASS
No Mercury runtime dependency               PASS
No NEVER-rule hardcoding                    PASS
Generic synthetic fixtures                  PASS
Guard extraction                            PASS
Throw extraction                            PASS
State assignment extraction                 PASS
Lifecycle fact extraction                   PASS
Multi-source transitions                    PASS
Negative-test evidence                      PASS
All five Mercury transitions                PASS
Refund fact update                          PASS
Refund fact not falsely cleared by cancel   PASS
Zod validation before persistence           PASS
Deterministic output ordering               PASS
Schema regression tests                     PASS
Mercury regression tests                    PASS
No Phase 3+ implementation                  PASS
No semantic NeverRule synthesis             PASS
```

---

## 18. Why This Bob Session Matters

This session demonstrates IBM Bob being used to build NeverGraph's real repository-understanding infrastructure.

The important result is not simply that Bob generated TypeScript.

Bob implemented and verified a deterministic boundary between:

```text
what source code objectively contains
```

and:

```text
what AI later concludes that source code means
```

That separation is central to NeverGraph's product design.

The analyzer now provides evidence-backed, source-traceable facts that IBM Bob can later use for semantic negative-invariant synthesis without letting the model invent execution truth.

---

## 19. Session Outcome

**Status:** PHASE 2 COMPLETE

NeverGraph now has a working deterministic pipeline:

```text
REAL TYPESCRIPT REPOSITORY
          ↓
      TS-MORPH AST
          ↓
 STRUCTURED EVIDENCE
          +
 STRUCTURED TRANSITIONS
          ↓
   ZOD VALIDATION
          ↓
  STABLE JSON OUTPUT
```

The next implementation phase is:

```text
PHASE 3 — Generic Context-Aware Graph Engine + Bounded BFS
```

Phase 3 should consume the analyzer contract as-is and must not modify Mercury simply to make graph exploration easier.

---

## 20. Recommended Submission Evidence Pair

Store this markdown file as:

```text
bob_sessions/03_repository_analyzer.md
```

Store the corresponding IBM Bob task/session screenshot as:

```text
bob_sessions/03_repository_analyzer.png
```

Together they document IBM Bob's material role in implementing and verifying NeverGraph's deterministic repository analyzer.
