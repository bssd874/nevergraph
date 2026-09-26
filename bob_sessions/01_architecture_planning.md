# IBM Bob Planning Session Evidence — NeverGraph

**Project:** NeverGraph  
**Hackathon:** IBM Bob 2.0 Hackathon 2026  
**Session Type:** IBM Bob — Plan Mode  
**Evidence ID:** `01_architecture_planning`  
**Date:** 2026-09-26  
**Purpose:** Architecture planning, PRD audit, scope locking, and implementation sequencing before any product code was written.

---

## 1. Session Goal

This planning session was used to make IBM Bob a core part of the NeverGraph engineering workflow before implementation began.

Bob was asked to:

- read `docs/PRD.md` completely;
- audit the PRD for contradictions and infeasible assumptions;
- propose the final repository architecture;
- define implementation phases and dependencies;
- separate deterministic NeverGraph logic from AI reasoning;
- identify risks to the golden demo;
- avoid implementation until the plan was explicitly approved.

The repository was intentionally almost empty when this session began.

---

## 2. Product Context

NeverGraph is a **Negative Specification Compiler**.

Its core promise is:

> Recover what your software has learned must never happen. Prove every new change still cannot make it happen.

The golden demonstration centers on a synthetic TypeScript commerce repository called **Mercury Commerce**.

NeverGraph must:

1. inspect repository evidence;
2. infer undocumented negative invariants using IBM Bob;
3. compile those invariants into machine-checkable rules;
4. build a behavioral graph;
5. detect when a code change makes a forbidden state reachable;
6. find a minimum violating witness;
7. generate and run an executable regression test;
8. let Bob produce a minimal repair;
9. rerun the witness and verify the forbidden state is unreachable again.

---

## 3. PRD Audit Performed by IBM Bob

Bob identified three notable planning issues.

### 3.1 Rule Count Inconsistency

The PRD demo copy originally referred to:

> `14 latent NEVER rules recovered`

while the Mercury specification only defined approximately five candidate rules.

Bob recommended making the demo deterministic rather than fabricating extra rules.

### Final Decision

Use exactly:

> **5 latent NEVER rules recovered**

The golden rule remains:

> **NEVER-003 — A refunded order must never become shipped.**

Only NEVER-003 requires the complete:

`regress → witness → executable proof → repair → re-verification`

workflow.

The other four rules must still be genuinely inferred from repository evidence.

---

### 3.2 Ambiguous `from` State Extraction

Bob identified that `ts-morph` can reliably detect assignments such as:

```ts
order.status = "PAID";
```

but the previous state may need to be inferred from surrounding guards.

### Final Decision

Mercury will intentionally use a constrained, documented syntax grammar so the MVP analyzer can extract transitions reliably.

This is an accepted hackathon simplification.

The analyzer may support a limited grammar, but it must **not** special-case Mercury filenames, NEVER rule IDs, or the golden scenario.

---

### 3.3 Context-Sensitive Graph State

Bob identified a critical modeling issue.

A graph keyed only by status would incorrectly treat these two states as identical:

```text
PAID + refunded=false
PAID + refunded=true
```

That would hide the golden bug:

```text
REFUND
→ CANCEL
→ RESTORE
→ PAID
→ SHIP
```

### Final Decision

Use **context-aware bounded BFS**.

The graph engine must remain domain-agnostic.

Approved generic model:

```ts
interface GraphState {
  state: string;
  facts: Record<string, boolean | string | number | null>;
}
```

Mercury may map repository semantics into facts such as:

```json
{
  "state": "PAID",
  "facts": {
    "refunded": true,
    "cancelled": true
  }
}
```

The NeverGraph graph engine must not hard-code fields such as `refundedAt`, `paidAt`, or `cancelledAt`.

---

## 4. Architecture Approved During Planning

```text
                         IBM BOB
                            │
                    NeverGraph Skill
                            │
                            │ MCP
                            ▼
              ┌────────────────────────┐
              │  NeverGraph MCP Server │
              │      TypeScript        │
              └────────────┬───────────┘
                           │
       ┌───────────────────┼────────────────────┐
       │                   │                    │
       ▼                   ▼                    ▼
 Repository Analyzer   Graph Engine        Test Runner
    ts-morph             TypeScript           Vitest
       │                   │                    │
       └───────────────────┼────────────────────┘
                           │
                           ▼
                   Mercury Repository

                           │
                           ▼

              ┌────────────────────────┐
              │ NeverGraph Dashboard   │
              │ Next.js + React Flow   │
              └────────────────────────┘
```

---

## 5. AI vs Deterministic Responsibilities

A major architectural decision from the planning session was to keep IBM Bob responsible for semantic reasoning while NeverGraph code remains responsible for deterministic verification.

Approved pipeline:

```text
repository source
        ↓
deterministic evidence extraction
        ↓
validated Evidence[]
        ↓
IBM Bob semantic invariant synthesis
        ↓
validated NeverRule[]
        ↓
deterministic graph / reachability engine
        ↓
deterministic witness
        ↓
executable proof
```

### IBM Bob Responsibilities

- understand repository semantics;
- synthesize candidate negative invariants;
- explain why evidence supports an invariant;
- help convert witnesses into idiomatic regression tests;
- perform minimal repair after a violation is proven;
- coordinate the verification workflow.

### Deterministic NeverGraph Responsibilities

- scan supported TypeScript syntax;
- normalize repository evidence;
- validate structured data with Zod;
- compile graph states and transitions;
- run bounded BFS;
- produce the minimum known witness;
- execute Vitest;
- distinguish suspected vs reproduced violations;
- verify the repaired invariant.

Bob must not be treated as the authority for reachability.

---

## 6. Anti-Hardcoding Rules Locked in Planning

The planning session explicitly rejected demo-specific shortcuts.

### Allowed

- supporting a limited guard syntax;
- supporting a limited state-assignment syntax;
- supporting specific Vitest negative-test patterns;
- documenting supported analyzer grammar;
- using a controlled synthetic Mercury repository.

### Forbidden

- checking for Mercury filenames to return predetermined rules;
- returning `NEVER-003` because the demo scenario is active;
- embedding the expected counterexample path as static output;
- special-casing the golden demo inside the graph engine;
- directly mapping a filename or line number to a hard-coded invariant.

The expected behavior must emerge from:

```text
real repository structures
→ extracted evidence
→ Bob reasoning
→ validated rule
→ deterministic reachability
```

---

## 7. Execution Strategy Decision

Bob initially noted that the analyzer and graph engine could be developed in parallel.

### Final Decision

All phases will execute **strictly sequentially**.

Reason:

> Lock the analyzer output contract before the graph engine consumes it, reducing integration drift and hackathon debugging risk.

---

## 8. Final Phase Order

| Phase | Name | Hard Dependency |
|---|---|---|
| **PHASE 0** | Monorepo Foundation + Schemas | None |
| **PHASE 1** | Mercury Safe Baseline + Tests | Phase 0 |
| **PHASE 2** | ts-morph Analyzer | Phases 0, 1 |
| **PHASE 3** | Generic Graph Engine + Context-Aware BFS | Phase 2 |
| **PHASE 4** | Witness Generation + Vitest Runner | Phases 0, 1, 3 |
| **PHASE 5** | NeverGraph Bob Skill + MCP Server | Phases 2, 3, 4 |
| **PHASE 6** | Golden Demo End-to-End with Bob | Phases 1–5 |
| **PHASE 7** | Dashboard | Phase 6 |
| **PHASE 8** | Polish, README, Bob Sessions, Submission Assets | Phase 7 |

---

## 9. Phase 0 Scope Approved After Planning

PHASE 0 is limited to:

- root monorepo configuration;
- shared TypeScript configuration;
- shared Zod schemas;
- schema tests;
- local NeverGraph JSON stubs;
- root Vitest configuration.

It must **not** create:

- Mercury implementation;
- analyzer;
- graph search engine;
- MCP server;
- dashboard;
- Bob repair workflow;
- hard-coded Never rules.

---

## 10. Phase 0 Schema Decisions

The shared package will be:

```text
@nevergraph/schemas
```

Core schemas include:

- `GraphState`
- `GuardSignal`
- `EvidenceItem`
- `EvidenceType`
- `StateTransition`
- `ForbiddenCondition`
- `NeverRule`
- `NeverGraphData`
- `Witness`
- `ProofReceipt`

Important constraints:

- `GraphState` is generic.
- `StateTransition.from` and `.to` use `GraphState`.
- `ForbiddenCondition` is machine-evaluable structured data.
- `NeverRule.forbiddenCondition` uses `ForbiddenCondition`.
- no Mercury-specific names appear in shared graph types.
- Bob-generated structures are never consumed before Zod validation.

---

## 11. Additional Phase 0 Amendments

Before implementation, the following quality constraints were added:

1. every schema source file must have a corresponding test;
2. every object schema must have:
   - one successful parse test;
   - one missing-required-field rejection test;
3. `@nevergraph/schemas` must expose compiled JS and TypeScript declarations;
4. TypeScript compilation must emit `.d.ts` files;
5. package tests must reliably resolve the root Vitest configuration;
6. Phase 0 must stop after verification and must not commit automatically.

---

## 12. Why This Bob Session Matters

This session demonstrates IBM Bob being used for substantive engineering work rather than cosmetic code generation.

Bob contributed to:

- PRD contradiction detection;
- architecture design;
- state-model correctness;
- identifying history-sensitive graph semantics;
- separating AI reasoning from deterministic verification;
- preventing hard-coded demo logic;
- implementation sequencing;
- risk reduction for the golden path.

A key architectural insight from the planning process was that status-only BFS was insufficient.

Without context-aware graph state, the central NeverGraph violation could become invisible to the verifier.

---

## 13. Planning Session Outcome

**Status:** APPROVED WITH AMENDMENTS

The architecture is locked.

The project may move from **Plan Mode** to **Agent Mode** for:

> **PHASE 0 — Monorepo Foundation + Shared Schemas**

No later phase is approved yet.

Every phase must pass its acceptance criteria and receive explicit approval before the next phase begins.

---

## 14. Evidence Notes for Submission

Recommended accompanying Bob screenshot:

```text
bob_sessions/01_architecture_planning.png
```

Recommended markdown evidence artifact:

```text
bob_sessions/01_architecture_planning.md
```

This file should be committed alongside the Bob task-session screenshot so the reasoning, decisions, and implementation impact of the planning session are preserved in the hackathon repository.
