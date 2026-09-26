# IBM Bob Session Evidence — NeverGraph Phase 1

**Project:** NeverGraph  
**Hackathon:** IBM Bob 2.0 Hackathon 2026  
**Session Type:** IBM Bob — Agent Mode  
**Evidence ID:** `02_mercury_safe_baseline`  
**Date:** 2026-09-26  
**Phase:** PHASE 1 — Mercury Safe Baseline + Tests  
**Status:** Completed and approved for commit

---

## 1. Session Goal

This session used IBM Bob to implement the synthetic baseline application that NeverGraph will analyze later.

The objective was to create **Mercury Commerce**, a small standalone TypeScript order-lifecycle codebase that looks and behaves like an ordinary business repository.

Mercury was intentionally designed to contain real lifecycle guards, transitions, thrown errors, and negative tests without containing any NeverGraph-specific rule objects, NEVER IDs, graph fixtures, or hard-coded analyzer metadata.

The phase was deliberately limited to building the safe baseline only.

No analyzer, graph engine, witness generator, MCP server, Bob runtime skill, dashboard, or restore bug was allowed in this phase.

---

## 2. Core Product Constraint

Mercury must remain independent from NeverGraph.

The repository must look like normal application code rather than a synthetic fixture that already knows the answer.

Therefore Mercury was required to avoid:

- importing `@nevergraph/schemas`;
- importing any NeverGraph runtime package;
- using `NEVER-001`, `NEVER-002`, or other rule IDs;
- storing precomputed forbidden states;
- storing graph fixtures;
- storing evidence metadata for the analyzer;
- embedding hard-coded NeverGraph conclusions.

The intended architecture remains:

```text
Mercury
= ordinary business software

        ↓ analyzed by

NeverGraph
```

not:

```text
Mercury
= application coupled to NeverGraph types
```

---

## 3. Package Created

The phase created a standalone package:

```text
demo/mercury/
```

Final package name:

```text
@nevergraph/mercury
```

Primary technology:

- TypeScript
- Node.js
- Vitest
- pnpm workspace

No framework, server, ORM, database, DI framework, or external business runtime was introduced.

---

## 4. Mercury Domain Model

IBM Bob implemented the following lifecycle-oriented order model:

```ts
enum OrderStatus {
  CREATED,
  PAID,
  REFUNDED,
  CANCELLED,
  SHIPPED
}

interface Order {
  id: string;
  status: OrderStatus;
  createdAt: Date;
  paidAt: Date | null;
  refundedAt: Date | null;
  cancelledAt: Date | null;
  shippedAt: Date | null;
}
```

The domain deliberately preserves historical lifecycle facts such as:

```text
paidAt
refundedAt
cancelledAt
shippedAt
```

This is important because the later NeverGraph golden scenario depends on historical context surviving across status transitions.

---

## 5. Lifecycle Operations Implemented

IBM Bob implemented the following ordinary business operations:

```text
createOrder()
payOrder(order)
refundOrder(order)
cancelOrder(order)
shipOrder(order)
```

No `restoreOrder()` implementation exists yet.

### Baseline transitions

```text
CREATED
   │
 pay
   ▼
 PAID
  │  \
  │   \ ship
  │    └────────► SHIPPED
  │
 refund
  ▼
REFUNDED
  │
 cancel
  ▼
CANCELLED
```

Supported transitions:

| From | Operation | To |
|---|---|---|
| CREATED | `payOrder` | PAID |
| PAID | `refundOrder` | REFUNDED |
| PAID | `cancelOrder` | CANCELLED |
| REFUNDED | `cancelOrder` | CANCELLED |
| PAID | `shipOrder` | SHIPPED |

---

## 6. Golden-Path Design Decision

The most important baseline behavior is:

> A refunded order cannot be shipped.

This was intentionally **not** implemented with a special history-aware guard such as:

```ts
if (order.refundedAt) {
  throw ...
}
```

Instead, the baseline is safe because:

```text
refundOrder()
moves the order away from PAID
```

while:

```text
shipOrder()
only allows PAID
```

This makes the later regression meaningful.

The future changed scenario can introduce:

```text
REFUNDED
   ↓
CANCELLED
   ↓
restore()
   ↓
PAID + refundedAt still present
```

At that point the old `shipOrder()` status guard becomes insufficient.

This creates the history-sensitive state NeverGraph is designed to detect.

---

## 7. Historical Fact Preservation

A critical requirement was that:

```text
REFUNDED
   ↓ cancel
CANCELLED
```

must preserve:

```text
refundedAt != null
```

IBM Bob implemented and tested this behavior.

This decision directly supports the later context-aware graph representation:

```text
PAID + refunded=false
```

must remain distinguishable from:

```text
PAID + refunded=true
```

even when both share the same lifecycle status.

---

## 8. Five Latent Negative Behavior Clusters

Mercury now naturally encodes five important negative behaviors through ordinary source code and tests.

No NeverRule objects or NEVER IDs were created.

### Behavior 1

```text
An unpaid CREATED order cannot be shipped.
```

Evidence source:

- `shipOrder` lifecycle guard
- negative Vitest test

### Behavior 2

```text
A cancelled order cannot be shipped.
```

Evidence source:

- `shipOrder` lifecycle guard
- negative Vitest test

### Behavior 3 — Golden Behavior

```text
A refunded order cannot be shipped.
```

Evidence source:

- `refundOrder` transitions away from PAID
- `shipOrder` requires PAID
- negative Vitest test

### Behavior 4

```text
A shipped order cannot be cancelled.
```

Evidence source:

- `cancelOrder` guard
- thrown domain error
- negative Vitest test

### Behavior 5

```text
A refunded order cannot simply be paid again.
```

Evidence source:

- `payOrder` requires CREATED
- negative Vitest test

These behaviors exist as consequences of real application semantics.

They are not precompiled NeverGraph rules.

---

## 9. Important Anti-Hardcoding Outcome

The Phase 1 implementation satisfied the requirement that Mercury contain no:

```text
NEVER IDs
NeverRule objects
forbidden-state metadata
graph fixtures
analyzer-specific fixtures
hard-coded evidence JSON
```

The future analyzer must derive evidence from:

```text
source guards
state assignments
throws
tests
preserved lifecycle facts
```

rather than reading an answer embedded in Mercury.

---

## 10. Test Coverage

IBM Bob created:

```text
34 Mercury tests
```

All 34 passed.

Coverage includes:

- normal order creation;
- successful payment;
- successful refund;
- cancellation from PAID;
- cancellation from REFUNDED;
- successful shipment from PAID;
- CREATED shipment rejection;
- CANCELLED shipment rejection;
- REFUNDED shipment rejection;
- SHIPPED cancellation rejection;
- REFUNDED payment rejection;
- lifecycle fact preservation;
- `refundedAt` preservation after cancellation.

Phase 0 schema tests were also rerun:

```text
71 / 71 passed
```

Combined verification during Phase 1:

```text
Mercury: 34 / 34 PASS
Schemas: 71 / 71 PASS
```

---

## 11. Commands Verified by IBM Bob

The following commands completed successfully:

```bash
pnpm install

pnpm --filter @nevergraph/mercury build

pnpm --filter @nevergraph/mercury typecheck

pnpm --filter @nevergraph/mercury test

pnpm --filter @nevergraph/schemas test
```

All returned exit code:

```text
0
```

---

## 12. Package Naming Cleanup

The first implementation used package name:

```text
mercury
```

Before the phase was closed, this was changed to:

```text
@nevergraph/mercury
```

This was a repository naming cleanup only.

No source behavior, tests, lifecycle semantics, or architecture changed.

After the rename:

```text
Mercury tests: 34 / 34 PASS
Schema tests:  71 / 71 PASS
```

---

## 13. Files Created

Key Phase 1 files:

```text
demo/mercury/
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── src/
    ├── domain/
    │   ├── order.ts
    │   └── errors.ts
    ├── services/
    │   └── order-service.ts
    ├── __tests__/
    │   └── order-lifecycle.test.ts
    └── index.ts
```

The workspace lockfile was also updated for required TypeScript/Node development dependencies.

---

## 14. Phase 1 Acceptance Outcome

All Phase 1 acceptance criteria passed.

Highlights:

```text
Standalone Mercury package                       PASS
No NeverGraph runtime dependency                 PASS
Simple explicit lifecycle syntax                 PASS
CREATED → PAID                                   PASS
PAID → REFUNDED                                  PASS
PAID → CANCELLED                                 PASS
REFUNDED → CANCELLED                             PASS
PAID → SHIPPED                                   PASS
Invalid lifecycle transitions rejected           PASS
Historical refund fact preserved                 PASS
No restore implementation                        PASS
No NEVER IDs / hard-coded evidence               PASS
Mercury tests 34/34                              PASS
Schema tests 71/71                               PASS
No Phase 2+ implementation                       PASS
Five latent negative behavior clusters           PASS
```

---

## 15. Why This Bob Session Matters

This session demonstrates IBM Bob being used to implement a carefully constrained synthetic codebase whose semantics will later be analyzed by NeverGraph.

Bob was not merely used to generate boilerplate.

The session required Bob to preserve several product-critical properties simultaneously:

- realistic ordinary business code;
- constrained AST-friendly syntax;
- no NeverGraph coupling;
- no hidden answer fixtures;
- history-sensitive lifecycle state;
- future exploitability through a later restore feature;
- full passing baseline tests;
- preservation of prior Phase 0 contracts.

The Mercury baseline now provides the controlled environment required for NeverGraph's later proof:

```text
safe baseline
     ↓
new feature
     ↓
latent invariant regression
     ↓
minimum witness
     ↓
executable proof
     ↓
Bob repair
     ↓
re-verification
```

---

## 16. Session Outcome

**Status:** PHASE 1 COMPLETE

Mercury is now the frozen safe baseline for subsequent analysis work.

The next approved development phase is:

```text
PHASE 2 — ts-morph Repository Analyzer
```

Phase 2 must treat Mercury as an existing repository to inspect.

It must not modify Mercury behavior merely to make analysis easier.

---

## 17. Recommended Submission Evidence Pair

Store this markdown file as:

```text
bob_sessions/02_mercury_safe_baseline.md
```

Store the corresponding IBM Bob task/session screenshot as:

```text
bob_sessions/02_mercury_safe_baseline.png
```

Together they document that IBM Bob was materially involved in implementing and verifying the safe Mercury baseline.
