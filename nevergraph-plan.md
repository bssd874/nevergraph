# NeverGraph Implementation Plan

## Overview

NeverGraph is a developer tool that discovers negative invariants hidden inside a TypeScript repository,
compiles them into a machine-checkable graph, and proves whether a code change makes a previously
impossible state reachable. The MVP is built around one golden demo: NEVER-003 ("A refunded order must
never become shipped") is auto-discovered from the Mercury demo repo, a hidden restore path violates it,
NeverGraph proves the violation with a Vitest test, IBM Bob repairs the code, and the rule becomes
unreachable again.

**Scope boundary**: Golden demo end-to-end before any UI polish or optional features.
**Constraint**: TypeScript-only, pnpm workspace, local-first, no Docker/DB/auth.

## Approved Decisions (post-review amendments)

### Decision 1 — Rule Count
Mercury contains exactly **5** latent Never Rules. All demo copy, dashboard headers, and README
must say "5 latent NEVER rules recovered." Do not say "5+" or "14". All five rules must be
genuinely inferred from repository evidence. Only NEVER-003 requires the full
regress → witness → proof → repair → re-verification cycle.

### Decision 2 — Generic Graph State Model
The graph engine must be domain-agnostic. Core types use:

```typescript
interface GraphState {
  state: string;                                    // e.g. "PAID"
  facts: Record<string, boolean | string | number | null>;  // e.g. { refunded: true }
}
```

Mercury maps its domain semantics into `facts` before calling the graph engine.
The graph engine never references Mercury field names (`refundedAt`, `paidAt`, etc.).
Forbidden conditions are evaluated against `state + facts` generically.
The Mercury-specific mapping lives in the analyzer's normalizer, not the graph package.

### Decision 3 — Sequential Execution
Phases execute strictly sequentially: the analyzer output contract must be working and locked
before implementing the graph engine. No parallel phase work.

### Anti-Hardcoding Constraint (mandatory)
The following are explicitly forbidden in all NeverGraph code:
- Checking for Mercury filenames to return a predetermined invariant
- Returning NEVER-003 because a demo scenario is active
- Embedding the counterexample path as a static answer
- Special-casing the golden demo anywhere in the graph engine

Allowed:
- Documenting and supporting specific guard syntax patterns
- Documenting and supporting specific state-assignment syntax patterns
- Documenting and supporting specific Vitest negative-test syntax patterns

The pipeline must remain:
```
repository source
→ deterministic evidence extraction
→ validated Evidence[]
→ IBM Bob semantic invariant synthesis
→ validated NeverRule[]
→ deterministic graph/reachability engine
→ deterministic witness
→ executable proof
```

---

## PRD Audit — Contradictions and Feasibility Risks

### Real Contradictions

1. **"14 latent NEVER rules recovered" (§30) vs "At least 4–6 latent Never Rules" (§19)**
   — The demo script calls for 14 recovered rules from a repository that the PRD describes as having only
   5 candidate rules. Either the demo copy must be adjusted to "5+ rules recovered" or Mercury must be
   written with richer evidence to justify 14. **Decision needed: use the lower, honest number.**

2. **ts-morph can extract state transitions deterministically vs Bob infers rules from evidence**
   — The PRD correctly separates static analysis from AI reasoning, but §12 says Bob "may delegate
   repository exploration into focused subagents." If subagents call MCP tools, they depend on the MCP
   server existing. MCP server depends on the analyzer. The order of construction is well-defined, but
   the plan must strictly enforce it.

3. **FR-003 expects transition extraction to produce `"from"/"to"` pairs automatically**
   — ts-morph can find `order.status = "PAID"` assignments, but reliably inferring the `"from"` state
   requires either: (a) reading the calling context/guard, or (b) treating every guarded function entry
   as the implicit `from`. For Mercury specifically, this works because all transitions are written as
   named functions with clear guard patterns. For arbitrary repos, it would not. **No contradiction
   for Mercury-scoped MVP.**

4. **FR-013 says test must "fail against the buggy implementation"**
   — The runner must execute real Vitest against the Mercury repo's actual source files, not mocked
   stubs. This means the generated test must import from Mercury paths. The test generator must be
   aware of Mercury's module structure. **Plan accordingly.**

### Feasibility Risks for Golden Demo

| Risk | Severity | Mitigation |
|------|----------|------------|
| Bob infers the wrong or no invariant | HIGH | Provide richly structured evidence; prompt Bob to output Zod-validated JSON |
| ts-morph misses a transition after the restore feature is added | HIGH | Write Mercury so all transitions follow one consistent pattern |
| Generated Vitest test has import errors and fails for infra not logic | HIGH | Use a template-based generator with tested import paths |
| BFS finds no path in the safe baseline because graph is too sparse | MEDIUM | Explicitly encode all transitions in Mercury's service functions |
| Bob's repair is too broad (renames types, refactors unrelated code) | MEDIUM | Skill instructions must say: change minimum lines, no refactor |
| Dashboard loads stale `.nevergraph/` JSON instead of live state | MEDIUM | Use file-watch polling or explicit reload button |
| pnpm workspace link resolution breaks MCP server's `require()` | LOW | Use workspace:* protocol consistently |

---

## 1. Final Repository Tree

```
nevergraph/
├── apps/
│   └── dashboard/
│       ├── src/
│       │   ├── app/                     # Next.js App Router pages
│       │   │   ├── page.tsx             # Root — repository picker
│       │   │   └── analysis/
│       │   │       └── page.tsx         # Main analysis view
│       │   ├── components/
│       │   │   ├── NeverRuleCard.tsx
│       │   │   ├── EvidenceDrawer.tsx
│       │   │   ├── NeverGraphCanvas.tsx # @xyflow/react wrapper
│       │   │   ├── WitnessView.tsx
│       │   │   ├── ProofTerminal.tsx
│       │   │   └── RepairStatus.tsx
│       │   └── lib/
│       │       └── api.ts               # Thin client for .nevergraph/ JSON
│       ├── package.json
│       ├── tailwind.config.ts
│       └── next.config.ts
│
├── packages/
│   ├── schemas/                         # Shared Zod schemas (no deps)
│   │   ├── src/
│   │   │   ├── evidence.ts
│   │   │   ├── transition.ts
│   │   │   ├── rule.ts
│   │   │   ├── graph.ts
│   │   │   ├── witness.ts
│   │   │   └── proof.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── analyzer/                        # ts-morph static analysis
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── scanner.ts               # Entry: walk repo files
│   │   │   ├── extractors/
│   │   │   │   ├── transitions.ts       # status assignment extraction
│   │   │   │   ├── guards.ts            # throw/if-refundedAt extraction
│   │   │   │   ├── tests.ts             # negative test extraction
│   │   │   │   └── comments.ts          # terminal comment extraction
│   │   │   └── normalizer.ts            # Output → EvidenceItem[]
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── graph/                           # Graph engine + BFS
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── builder.ts               # Transitions → NeverGraph
│   │   │   ├── reachability.ts          # BFS forbidden-state search
│   │   │   ├── witness.ts               # Minimum path extractor
│   │   │   └── comparator.ts            # Baseline vs changed graph diff
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── runner/                          # Witness → Vitest file + executor
│       ├── src/
│       │   ├── index.ts
│       │   ├── generator.ts             # Witness → .test.ts file
│       │   ├── executor.ts              # spawn vitest, capture output
│       │   └── templates/
│       │       └── mercury.witness.ts.hbs  # Handlebars template
│       ├── package.json
│       └── tsconfig.json
│
├── mcp/
│   └── server/
│       ├── src/
│       │   ├── index.ts                 # MCP server entrypoint
│       │   └── tools/
│       │       ├── scan_repository.ts
│       │       ├── get_repository_evidence.ts
│       │       ├── get_transitions.ts
│       │       ├── get_never_rules.ts
│       │       ├── build_nevergraph.ts
│       │       ├── analyze_change.ts
│       │       ├── find_counterexample.ts
│       │       ├── run_witness.ts
│       │       └── verify_rule.ts
│       ├── package.json
│       └── tsconfig.json
│
├── demo/
│   └── mercury/
│       ├── src/
│       │   ├── domain/
│       │   │   ├── order.ts             # Order type + status enum
│       │   │   └── payment.ts           # Payment type
│       │   ├── services/
│       │   │   ├── order.service.ts     # pay, cancel, refund, ship
│       │   │   ├── shipment.service.ts  # ship() with refundedAt guard
│       │   │   └── refund.service.ts    # refund() with status guard
│       │   └── errors.ts
│       ├── tests/
│       │   ├── order.spec.ts            # Baseline tests (all pass)
│       │   └── regression/              # Generated by NeverGraph (post-demo)
│       │       └── NEVER-003.spec.ts
│       ├── package.json                 # includes vitest
│       └── tsconfig.json
│
├── .bob/
│   ├── mcp.json
│   └── skills/
│       └── nevergraph/
│           └── SKILL.md
│
├── .nevergraph/
│   ├── repository.json
│   ├── evidence.json
│   ├── transitions.json
│   ├── rules.json
│   ├── analysis.json
│   └── proofs/
│       └── NEVER-003.json
│
├── bob_sessions/
├── docs/
│   └── PRD.md
├── AGENTS.md
├── pnpm-workspace.yaml
├── package.json                         # workspace root
└── README.md
```

---

## 2. Data Contracts Between Components

These contracts must be finalized in `packages/schemas` before anything else is built.
**The graph engine must remain domain-agnostic** — Mercury field names (`refundedAt`, `paidAt`,
`cancelledAt`) must never appear in `packages/graph` or `packages/schemas`. They live only in
Mercury source code and the analyzer normalizer.

### GraphState (generic — domain-agnostic graph node key)
```typescript
interface GraphState {
  state: string;                                               // e.g. "PAID", "SHIPPED"
  facts: Record<string, boolean | string | number | null>;    // e.g. { refunded: true }
}
```

Mercury maps its domain into `GraphState` **inside `packages/analyzer/src/normalizer.ts`** only:
```typescript
// packages/analyzer/src/normalizer.ts  (Mercury-specific mapping — NOT in packages/graph)
function orderToGraphState(order: MercuryOrder): GraphState {
  return {
    state: order.status,
    facts: {
      refunded:  order.refundedAt  !== null,
      paid:      order.paidAt      !== null,
      cancelled: order.cancelledAt !== null,
    }
  };
}
```

### GuardSignal (part of StateTransition — describes entry conditions)
```typescript
interface GuardSignal {
  field:    string;                                       // normalized fact key, e.g. "refunded"
  operator: "eq" | "neq" | "truthy" | "falsy";
  value:    boolean | string | number | null;
}
```

### EvidenceItem (from analyzer → stored in evidence.json → sent to Bob)
```typescript
interface EvidenceItem {
  id: string;           // "ev-001"
  type: "guard" | "state_transition" | "negative_test" | "throw" | "comment" | "constraint";
  file: string;         // relative path e.g. "src/services/shipment.service.ts"
  line: number;
  symbol: string;       // function/class name
  snippet: string;      // short source excerpt
  summary: string;      // human-readable description
  metadata: Record<string, unknown>;
}
```

### StateTransition (from analyzer → graph builder)
```typescript
interface StateTransition {
  id: string;
  action: string;       // "ship", "refund", "restore"
  from: GraphState;     // { state: "PAID", facts: { refunded: false } }
  to: GraphState;       // { state: "SHIPPED", facts: { refunded: false } }
  file: string;
  line: number;
  guards: GuardSignal[];
}
```
If `from` cannot be inferred, set `from = { state: "UNKNOWN", facts: {} }`.
The graph engine treats `UNKNOWN` source as "reachable from any prior state" during BFS.

### ForbiddenCondition (part of NeverRule — evaluated generically)
```typescript
interface ForbiddenCondition {
  targetState:   string;                                        // e.g. "SHIPPED"
  requiredFacts: Record<string, boolean | string | number | null>; // e.g. { refunded: true }
}
```
For NEVER-003: `{ targetState: "SHIPPED", requiredFacts: { refunded: true } }`
The engine matches any `GraphState` where `state === targetState` AND all `requiredFacts` entries match.
No Mercury field names appear anywhere in this evaluation.

### NeverRule (from Bob via Zod validation → stored in rules.json → graph engine)
```typescript
interface NeverRule {
  id: string;                           // "NEVER-003"
  description: string;
  confidence: "low" | "medium" | "high";
  forbiddenCondition: ForbiddenCondition;
  evidence: Array<{ evidenceId: string; file: string; line: number }>;
}
```

### NeverGraph (built by graph engine)
```typescript
interface NeverGraphData {
  nodes: Array<{ id: string; label: string; forbidden?: boolean }>;
  edges: Array<{ id: string; source: string; target: string; action: string }>;
  forbiddenConditions: NeverRule[];
  reachabilityStatus: Record<string, "unreachable" | "reachable" | "unknown">;
}
```

### Witness (from BFS → runner → proof)
```typescript
interface Witness {
  ruleId: string;
  steps: Array<{ action: string; fromState: GraphState; toState: GraphState }>;
  length: number;
  isForbidden: boolean;
}
```

### ProofReceipt
```typescript
interface ProofReceipt {
  ruleId: string;
  foundViolation: boolean;
  witness: Witness | null;
  testFile: string | null;
  testResult: "pass" | "fail" | "error" | "not_run";
  repairApplied: boolean;
  verificationResult: "pass" | "fail" | "not_run";
  existingTestsResult: "pass" | "fail" | "not_run";
  status: "suspected" | "reproduced" | "fixed" | "verified";
}
```

---

## 3. Mercury Domain Model

Mercury is a synthetic e-commerce order processing system with deliberate density of
negative-invariant signals. It must be written so ts-morph can reliably extract evidence.

### Order Status Enum
```typescript
enum OrderStatus {
  CREATED = "CREATED",
  PAID = "PAID",
  SHIPPED = "SHIPPED",
  REFUNDED = "REFUNDED",
  CANCELLED = "CANCELLED",
  RESTORED = "RESTORED"   // added in "buggy" scenario
}
```

### Order Type (domain model)
- `id`, `status: OrderStatus`, `createdAt: Date`
- `paidAt: Date | null`        — non-null signals payment (NEVER-002 evidence)
- `refundedAt: Date | null`    — non-null signals terminal state (NEVER-003 evidence)
- `shippedAt: Date | null`
- `cancelledAt: Date | null`

### Services (safe baseline — 5 files)
| File | Actions | Guard signals |
|------|---------|---------------|
| `order.service.ts` | `createOrder`, `payOrder`, `cancelOrder` | status checks before each |
| `shipment.service.ts` | `shipOrder` | throws if `!order.paidAt` or `order.refundedAt` |
| `refund.service.ts` | `refundOrder` | throws if `order.status === SHIPPED` |
| `payment.service.ts` | `capturePayment`, `releasePayment` | throws if already captured/refunded |
| `errors.ts` | `InvalidStateTransition` class | — |

### Baseline Tests (all pass in safe state)
- `order.spec.ts`: ~20 tests covering happy path and negative scenarios
  - `expect(() => shipOrder(refundedOrder)).toThrow()` → NEVER-003 evidence
  - `expect(() => shipOrder(cancelledOrder)).toThrow()` → NEVER-001 evidence
  - `expect(() => shipOrder(unpaidOrder)).toThrow()` → NEVER-002 evidence

### Support Restore Feature (introduced in buggy scenario)
- New file `support.service.ts`:
  ```typescript
  // Allows support agents to restore cancelled orders to PAID
  export function restoreOrder(order: Order): Order {
    if (order.status !== OrderStatus.CANCELLED) {
      throw new InvalidStateTransition("Can only restore cancelled orders");
    }
    // BUG: does not check order.refundedAt
    return { ...order, status: OrderStatus.PAID, cancelledAt: null };
  }
  ```
- This adds the transition: `CANCELLED → PAID` (restore path)
- Combined with existing `PAID → SHIPPED`, this enables: `REFUNDED → CANCELLED → PAID → SHIPPED`

### NEVER-003 Evidence Signals (planted in baseline)
1. **guard** — `shipment.service.ts:41` — `if (order.refundedAt) throw new InvalidStateTransition(...)`
2. **negative_test** — `order.spec.ts:122` — `expect(() => shipOrder(refundedOrder)).toThrow()`
3. **comment** — `shipment.service.ts:38` — `// Refunded orders are terminal — do not ship`
4. **constraint** — `order.ts:15` — `refundedAt: Date | null` (field preserved independent of status)

### How NEVER-003 Is Genuinely Inferred (not hardcoded)
1. Analyzer extracts 4 evidence items of types `guard`, `negative_test`, `comment`, `constraint` — all referencing `refundedAt` and the `SHIPPED` or `ship` symbol.
2. These are passed to Bob as structured JSON via MCP `get_repository_evidence`.
3. Bob's NeverGraph skill prompt instructs: group evidence by shared entity (e.g., `refundedAt`) and infer what transition it prevents. Bob emits a Zod-validated `NeverRule` JSON.
4. Zod validates the output. The rule is stored in `.nevergraph/rules.json`.
5. The graph engine reads from `rules.json` — it never sees a hardcoded string.

---

## 4. Implementation Phases

---

### PHASE 0 — Monorepo Foundation

**Intent**: Establish the pnpm workspace, TypeScript configs, and shared schemas so every subsequent package
has a stable foundation.

**Status**: [ ] pending

**Deliverables**:
- Root `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`
- `packages/schemas` with all Zod schema definitions and TypeScript interfaces
- `vitest.config.ts` at root level (shared)
- `.gitignore` updated
- `.nevergraph/` directory created with empty JSON stubs

**Important Files**:
- `packages/schemas/src/evidence.ts`
- `packages/schemas/src/transition.ts`
- `packages/schemas/src/rule.ts`
- `packages/schemas/src/graph.ts`
- `packages/schemas/src/witness.ts`
- `packages/schemas/src/proof.ts`
- `packages/schemas/src/index.ts` (barrel export)
- `packages/schemas/package.json`
- `.nevergraph/evidence.json` (empty array `[]`)
- `.nevergraph/transitions.json` (empty array `[]`)
- `.nevergraph/rules.json` (empty array `[]`)
- `.nevergraph/repository.json` (stub `{}`)
- `.nevergraph/analysis.json` (stub `{}`)

**Acceptance Criteria**:
- `pnpm install` completes with no errors
- `packages/schemas` builds with `tsc --noEmit` with no errors
- All Zod schema types match the interfaces in Section 2 of this plan
- `pnpm -r build` in schemas package succeeds

**Test Strategy**:
- One vitest unit test per schema: validate a valid object, reject a missing required field.
- Tests live in `packages/schemas/src/__tests__/`

---

### PHASE 1 — Mercury Demo Repository

**Intent**: Build the Mercury demo application that serves as the analyzed target. Mercury must contain
sufficient evidence density for NEVER-003 (and 4 other rules) to be genuinely discoverable.
The baseline must compile and pass all tests. The "buggy" state must also compile and pass existing tests.

**Status**: [ ] pending

**Deliverables**:
- Complete `demo/mercury/` package with source, tests, and package.json
- Baseline state: all 5 never-rules have planted evidence signals
- Buggy state documentation (the exact change that introduces the restore path)

**Important Files**:
- `demo/mercury/src/domain/order.ts` — `OrderStatus` enum, `Order` interface, `refundedAt` field
- `demo/mercury/src/domain/payment.ts` — `Payment` interface, `PaymentStatus` enum
- `demo/mercury/src/services/order.service.ts` — pay, cancel actions
- `demo/mercury/src/services/shipment.service.ts` — ship() with `refundedAt` guard + terminal comment
- `demo/mercury/src/services/refund.service.ts` — refund() with status guard
- `demo/mercury/src/services/payment.service.ts` — capture, release with guards
- `demo/mercury/src/errors.ts` — `InvalidStateTransition` error class
- `demo/mercury/tests/order.spec.ts` — baseline tests including negative cases
- `demo/mercury/tests/payment.spec.ts`
- `demo/mercury/vitest.config.ts`
- `demo/mercury/package.json`

**The "Buggy" File** (created only in Phase 6):
- `demo/mercury/src/services/support.service.ts` — restoreOrder() without refundedAt check

**Mercury Writing Rules**:
- All status assignments must be of the form `order.status = OrderStatus.XXX` (same pattern for ts-morph)
- All guards must be of the form `if (order.refundedAt) throw new InvalidStateTransition(...)`
- Negative tests must use `expect(() => fn(order)).toThrow()`
- Terminal comments must be directly above guard code (same line range for co-location)

**Acceptance Criteria**:
- `pnpm test` in `demo/mercury` passes with all tests green
- At least 4 evidence signals for NEVER-003 present across at least 3 different files
- At least 2 evidence signals for each of NEVER-001, 002, 004, 005
- Mercury has no TypeScript errors (`tsc --noEmit`)
- Mercury has no runtime dependency beyond vitest

**Test Strategy**:
- Mercury is itself a test suite. All tests must pass.
- Manual verification: count evidence signals per never-rule, confirm 3+ for NEVER-003.

---

### PHASE 2 — Repository Analyzer

**Intent**: Implement the ts-morph static analysis engine that walks Mercury source files and
extracts structured evidence items and state transitions.

**Status**: [ ] pending

**Deliverables**:
- `packages/analyzer` with scanner, four extractors, normalizer
- CLI entrypoint: `node packages/analyzer/dist/index.js --repo ./demo/mercury`
- Output: writes `.nevergraph/evidence.json` and `.nevergraph/transitions.json`

**Important Files**:
- `packages/analyzer/src/scanner.ts` — uses ts-morph `Project` to load all `.ts` files
- `packages/analyzer/src/extractors/transitions.ts` — finds `order.status = OrderStatus.X` pattern; reads enclosing function name as action; reads preceding guards for `from` state hint
- `packages/analyzer/src/extractors/guards.ts` — finds `if (order.X) throw` patterns
- `packages/analyzer/src/extractors/tests.ts` — finds `expect(() => fn(obj)).toThrow()` in `.spec.ts` files
- `packages/analyzer/src/extractors/comments.ts` — finds `// terminal` or `// never` pattern comments above throws
- `packages/analyzer/src/normalizer.ts` — merges extracted items into `EvidenceItem[]`, deduplicates, assigns IDs
- `packages/analyzer/src/index.ts` — CLI entrypoint

**Key Implementation Detail for Transition `from` State**:
- For functions named `refundOrder`: look for a guard `if (status === X)` or read the initial parameter type.
- For Mercury specifically, each service function has a predictable guard pattern that implies the `from` state.
- If `from` cannot be inferred, set it to `"UNKNOWN"` — this is acceptable for MVP.
- The graph engine can still find paths with some `UNKNOWN` edges; BFS will traverse all.

**Acceptance Criteria**:
- Running the analyzer against Mercury baseline produces evidence.json with ≥12 items
- Running the analyzer produces transitions.json with all 6 Mercury baseline transitions
- All extracted evidence items pass Zod `EvidenceItemSchema` validation
- All extracted transitions pass Zod `StateTransitionSchema` validation
- Analyzer runs in under 10 seconds on Mercury

**Test Strategy**:
- Vitest unit tests for each extractor against fixture code strings (not full Mercury)
- One integration test: run analyzer against `demo/mercury`, assert specific evidence IDs are present
- Tests in `packages/analyzer/src/__tests__/`

---

### PHASE 3 — Graph Engine

**Intent**: Build the custom TypeScript graph engine that converts state transitions into a NeverGraph,
performs bounded BFS to determine if a forbidden condition is reachable, and extracts the minimum witness.
The engine is **domain-agnostic**: it operates on `GraphState` and `ForbiddenCondition` generics.
No Mercury field names appear in this package.

**Status**: [ ] pending

**Deliverables**:
- `packages/graph` with builder, reachability, witness, comparator
- Can build a NeverGraph from a `StateTransition[]` and `NeverRule[]`
- Can determine reachability of each forbidden condition
- Can return the shortest witness path if reachable

**Important Files**:
- `packages/graph/src/builder.ts` — builds adjacency list from transitions; creates node/edge model
- `packages/graph/src/reachability.ts` — BFS from all entry states; evaluates `ForbiddenCondition` generically against `GraphState`
- `packages/graph/src/witness.ts` — traces BFS parent pointers to reconstruct minimum path
- `packages/graph/src/comparator.ts` — diffs two NeverGraph snapshots (baseline vs changed); returns new edges and new reachability changes

**BFS Design Note**:
- Graph nodes represent `GraphState` values: `{ state: string, facts: Record<string, ...> }`
- Node key for deduplication: `JSON.stringify({ state, facts })` (sorted keys)
- A `GraphState` node is forbidden if `state === forbiddenCondition.targetState`
  AND every entry in `forbiddenCondition.requiredFacts` matches the node's `facts`
- This correctly models REFUNDED→CANCELLED→RESTORED→PAID→SHIPPED as a violation
  while CREATED→PAID→SHIPPED is safe — without any Mercury-specific logic
- Depth bound for BFS: max 10 transitions (sufficient for Mercury, prevents cycles)

**Acceptance Criteria**:
- Given Mercury baseline transitions + NEVER-003 rule: reports `NEVER-003 = unreachable`
- Given Mercury + restore transition added: reports `NEVER-003 = reachable`
- Minimum witness for NEVER-003 violation has exactly 6 steps: create→pay→refund→cancel→restore→ship
- `comparator` correctly identifies the `CANCELLED→PAID` edge as newly introduced
- All graph data structures pass Zod `NeverGraphDataSchema` validation

**Test Strategy**:
- Vitest unit tests with small hand-crafted transition arrays
- Integration test: feed Mercury baseline transitions → assert NEVER-003 unreachable
- Integration test: feed Mercury + restore → assert NEVER-003 reachable, witness length = 6
- Tests in `packages/graph/src/__tests__/`

---

### PHASE 4 — Witness Generation + Vitest Runner

**Intent**: Build the component that takes a `Witness` and generates a real, executable Vitest test file,
then executes it and captures the result. (Moved before MCP server so the runner can be wired into
the MCP `run_witness` tool in Phase 5.)

**Status**: [ ] pending

**Deliverables**:
- `packages/runner` with generator and executor
- Can generate a Vitest file from a `Witness` for the Mercury domain
- Can execute the file with `vitest run`, capture stdout/stderr, and return `ProofReceipt`

**Generated Test Structure (for NEVER-003 witness)**:
```typescript
// AUTO-GENERATED by NeverGraph — DO NOT EDIT
// Rule: NEVER-003 — A refunded order must never become shipped.
// Witness: 6 transitions
import { describe, it, expect } from "vitest";
import { createOrder }  from "../../src/services/order.service";
import { payOrder }     from "../../src/services/order.service";
import { refundOrder }  from "../../src/services/refund.service";
import { cancelOrder }  from "../../src/services/order.service";
import { restoreOrder } from "../../src/services/support.service";
import { shipOrder }    from "../../src/services/shipment.service";

describe("NEVER-003 regression: refunded order must never become shipped", () => {
  it("must throw when shipping a refunded-then-restored order", () => {
    let order = createOrder();
    order = payOrder(order);
    order = refundOrder(order);
    order = cancelOrder(order);
    order = restoreOrder(order);
    expect(() => shipOrder(order)).toThrow();
  });
});
```

**Key Implementation Details**:
- The generator needs a mapping from action names → import paths (Mercury-specific config file,
  not embedded in the generator itself)
- Template approach (string template) is simpler than AST generation for MVP
- Generated file written to `demo/mercury/tests/regression/NEVER-{id}.spec.ts`
- Executor spawns `pnpm vitest run tests/regression/NEVER-003.spec.ts` with `cwd: demo/mercury/`
- Executor captures exit code, stdout, stderr; writes `ProofReceipt` to `.nevergraph/proofs/NEVER-003.json`
- `status: "error"` (not `"fail"`) if process crashes due to infrastructure (missing imports, etc.)

**Acceptance Criteria**:
- Generator produces a valid TypeScript file from the NEVER-003 witness
- File compiles with `tsc --noEmit` (no import errors)
- Before repair: `vitest run` exits with code 1; ProofReceipt has `testResult: "fail"`
- After Bob repair: `vitest run` exits with code 0; ProofReceipt has `testResult: "pass"`
- Executor returns `status: "error"` (not `"fail"`) for infrastructure crashes

**Test Strategy**:
- Unit test: generator produces correct string from a fixture Witness
- Integration test: generate + execute against actual Mercury
- Tests in `packages/runner/src/__tests__/`

---

### PHASE 5 — IBM Bob Skill + MCP Server

**Intent**: Build the NeverGraph MCP server exposing all deterministic tools, and write the Bob skill
that instructs Bob to use them correctly and to perform invariant synthesis from structured evidence.

**Status**: [ ] pending

**Deliverables**:
- `.bob/skills/nevergraph/SKILL.md` — complete Bob skill
- `.bob/mcp.json` — MCP server registration
- `mcp/server/` — MCP server with all 9 required tools

**MCP Tool Responsibilities**:

| Tool | Deterministic or Bob | What it does |
|------|---------------------|--------------|
| `scan_repository` | Deterministic | Runs analyzer, writes evidence.json + transitions.json |
| `get_repository_evidence` | Deterministic | Reads evidence.json, returns EvidenceItem[] |
| `get_transitions` | Deterministic | Reads transitions.json, returns StateTransition[] |
| `get_never_rules` | Deterministic | Reads rules.json, returns NeverRule[] |
| `build_nevergraph` | Deterministic | Runs graph builder, writes analysis.json |
| `analyze_change` | Deterministic | Runs comparator between baseline and current, returns diff |
| `find_counterexample` | Deterministic | Runs BFS, returns Witness or null |
| `run_witness` | Deterministic | Runs test runner, returns ProofReceipt |
| `verify_rule` | Deterministic | Checks current graph for rule reachability |

Bob's role (AI reasoning):
- `synthesize_never_rules`: Bob receives evidence array, reasons about clusters, emits `NeverRule[]` JSON
- `explain_evidence`: Bob explains why a rule was inferred
- `construct_test`: Bob refines machine-generated test into idiomatic Vitest
- `propose_repair`: Bob analyzes confirmed violation and implements minimal fix

**NeverGraph Skill Key Instructions**:
- Never claim a rule without citing ≥2 evidence items by ID
- Always emit structured JSON matching NeverRuleSchema
- Do not repair before `run_witness` returns `status: "reproduced"`
- After repair, always call `verify_rule` and `run_witness` again
- Prefer minimal repairs: add the guard check, do not refactor

**Acceptance Criteria**:
- MCP server starts with `node mcp/server/dist/index.js`
- Bob can call `scan_repository` and get structured EvidenceItem[] back
- Bob can call `find_counterexample` on the changed Mercury and receive the 6-step witness
- `run_witness` executes real Vitest and returns the fail result before repair
- All MCP tool outputs pass their respective Zod schemas
- `.bob/mcp.json` is valid and points to the MCP server correctly

**Test Strategy**:
- Unit tests for each MCP tool handler (mock file I/O)
- Integration test: start MCP server, call `scan_repository` against Mercury, assert output structure
- Manual: open Bob in IDE, confirm NeverGraph skill loads, call `get_never_rules` in Bob

---

### PHASE 6 — Golden Demo Wiring

**Intent**: Connect all components end-to-end. Introduce the buggy Support Restore feature into Mercury.
Run the full golden path manually and confirm every step works.

**Status**: [ ] pending

**Deliverables**:
- `demo/mercury/src/services/support.service.ts` — the buggy restore implementation
- `.nevergraph/` fully populated from a real analyzer + Bob run
- `demo/mercury/tests/regression/NEVER-003.spec.ts` — generated and committed
- Documented end-to-end run script in README
- Bob session screenshots in `bob_sessions/`

**Golden Path Verification Checklist**:
1. `pnpm test` in mercury baseline → all pass
2. `scan_repository` (via Bob + MCP) → evidence.json populated with ≥12 items
3. Bob synthesizes rules → rules.json contains NEVER-003 with confidence "high"
4. `build_nevergraph` → analysis.json shows NEVER-003: "unreachable"
5. Add `support.service.ts` with buggy restore
6. `pnpm test` in mercury → all still pass (existing tests don't cover the new path)
7. `analyze_change` → detects new `CANCELLED→PAID` edge
8. `find_counterexample` → returns 6-step witness
9. `run_witness` (before repair) → `testResult: "fail"`, `status: "reproduced"`
10. Bob receives proof, implements repair (adds `if (order.refundedAt) throw`)
11. `run_witness` (after repair) → `testResult: "pass"`, `status: "verified"`
12. `pnpm test` in mercury → all pass including new regression test
13. `verify_rule` → NEVER-003: "unreachable"

**Acceptance Criteria**:
- All 13 golden path steps pass
- No step requires manual hardcoding of NEVER-003 text
- Bob session screenshots captured for each major step

**Test Strategy**:
- This phase is the integration test. No additional automated tests.
- Golden path is run once with Bob in the loop, screenshots captured.

---

### PHASE 7 — Dashboard

**Intent**: Build the Next.js dashboard that reads `.nevergraph/` JSON and visualizes the golden path.
Dashboard is read-only for MVP — it displays precomputed results, it does not trigger analysis.

**Status**: [ ] pending

**Deliverables**:
- `apps/dashboard/` — Next.js app with all required sections
- Reads from `.nevergraph/` JSON files (static file serve or API route)
- NeverGraph visualization using `@xyflow/react`
- All 7 dashboard sections from PRD §17

**Dashboard Architecture Decision**:
- Next.js API routes serve `.nevergraph/*.json` files
- Dashboard polls (or uses a manual reload button) — no websockets for MVP
- State switching (baseline vs changed vs repaired) is done by reading different analysis.json snapshots
  or by a query param (`?scenario=baseline|changed|repaired`)

**Important Files**:
- `apps/dashboard/src/app/page.tsx` — shows repository loaded, rule count, violation count
- `apps/dashboard/src/app/analysis/page.tsx` — main view
- `apps/dashboard/src/components/NeverGraphCanvas.tsx` — @xyflow/react canvas
- `apps/dashboard/src/components/NeverRuleCard.tsx` — NEVER-003 card with evidence count
- `apps/dashboard/src/components/EvidenceDrawer.tsx` — slide-out evidence detail
- `apps/dashboard/src/components/WitnessView.tsx` — step sequence display
- `apps/dashboard/src/components/ProofTerminal.tsx` — monospace test output
- `apps/dashboard/src/components/RepairStatus.tsx` — before/after unreachable status
- `apps/dashboard/src/lib/api.ts` — fetch helpers for JSON endpoints

**Acceptance Criteria**:
- `pnpm dev` in `apps/dashboard` starts without error
- Dashboard shows NEVER-003 card with evidence count and confidence: HIGH
- NeverGraph canvas renders state nodes and transition edges
- Switching to "changed" scenario shows NEVER-003 as reachable with highlighted path
- Witness view shows the 6-step sequence
- ProofTerminal shows test failure output
- After switching to "repaired" scenario: NEVER-003 unreachable, test passes

**Test Strategy**:
- No automated UI tests for MVP
- Manual verification against golden path scenarios

---

### PHASE 8 — Polish + Repo Hygiene

**Intent**: README, AGENTS.md, .bob configuration, demo video preparation.
Only after the golden path works end-to-end.

**Status**: [ ] pending

**Deliverables**:
- `README.md` — clear setup instructions, golden path walkthrough
- `AGENTS.md` + `.bob/rules-*/AGENTS.md` — agent guidance
- `bob_sessions/` — all screenshots organized
- `.bob/mcp.json` — verified and documented
- Any visual polish to dashboard (animations, color refinement)

---

## 5. What Should Be Deterministic Code vs IBM Bob Reasoning

| Task | Who | Reason |
|------|-----|--------|
| ts-morph file walking | Deterministic | Mechanical pattern matching |
| Status assignment extraction | Deterministic | Syntactic, not semantic |
| Guard pattern extraction | Deterministic | AST query |
| Negative test extraction | Deterministic | Syntactic |
| Comment extraction | Deterministic | Regex/text scan |
| Evidence normalization | Deterministic | Data transformation |
| BFS reachability | Deterministic | Algorithm, not reasoning |
| Witness extraction | Deterministic | Pointer tracing |
| Graph diff | Deterministic | Set operations |
| Test file generation | Deterministic (template) | Structure is fixed |
| Test execution | Deterministic | Shell command |
| **Invariant synthesis from evidence** | **IBM Bob** | Semantic clustering, natural language |
| **Evidence explanation** | **IBM Bob** | Narrative justification |
| **Test idiom refinement** | **IBM Bob** | Optional; template may suffice |
| **Minimal repair implementation** | **IBM Bob** | Reasoning about minimal change |
| **Verification orchestration** | **IBM Bob** | Workflow with MCP calls |

---

## 6. MCP Tool Boundary Summary

```
Bob calls MCP tools to invoke the deterministic engine.
Bob never performs BFS itself.
Bob never writes evidence.json directly.
MCP tools never synthesize invariants.
MCP tools always validate input/output with Zod before returning.
```

---

## 7. Risks That Could Cause the Golden Demo to Fail

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Bob infers wrong rule from evidence | Medium | Demo fails at step 3 | Provide dense, unambiguous evidence; test Bob inference early |
| Bob emits invalid JSON, Zod rejects | Medium | Demo breaks at rule storage | Validate in Bob skill prompt; retry once before error |
| ts-morph misses restore transition | Medium | Witness never found | Write Mercury so restore transition follows exact same pattern |
| Generated test has import errors | Medium | Proof step fails for infra reason | Pre-validate template against Mercury module structure |
| BFS finds too many states, runs slow | Low | Demo pauses | Depth limit of 10 is sufficient |
| Bob repair touches too many lines | Medium | Existing tests break | Skill instruction: only add one guard check |
| Dashboard shows stale JSON | Low | Confusing for audience | Use explicit reload + clear cache |
| `pnpm link` doesn't resolve schemas | Low | Build fails | Test `pnpm install` after every package addition |

---

## 8. Recommended Hackathon Simplifications

1. **Skip real Git diff**: Use a controlled `support.service.ts` file that is added/removed manually (or via a script) to switch between baseline and changed scenarios. No git diff API needed.

2. **Template-based test generation**: Use string templates instead of AST generation. The Mercury test structure is fixed enough to template.

3. **No dashboard-triggered analysis**: Dashboard reads pre-computed `.nevergraph/` JSON. Trigger analysis via Bob + MCP, not from the browser.

4. **Single domain (Mercury only)**: Analyzer only needs to work for Mercury patterns. Do not implement generic pattern detection.

5. **`from` state heuristic**: If a transition's `from` state cannot be determined, set it to the function's first status guard value. Accept some `UNKNOWN` edges.

6. **No Bob subagents for invariant synthesis**: Have Bob do synthesis in one call with all evidence in context rather than spawning sub-agents. Simpler, fewer failure modes.

7. **Confidence heuristic**: evidence count ≥3 → HIGH, =2 → MEDIUM, =1 → LOW. No complex scoring.

8. **Scenario switching via query param**: `?scenario=baseline` vs `?scenario=changed` vs `?scenario=repaired`, served from separate JSON snapshot files.

---

## 9. Items Postponed Until After Golden Path Works

- React Flow path animation
- Proof Receipt UI component
- Multiple domain support
- CLI entrypoint
- Git diff automation
- Dashboard-triggered scan button
- Bob subagent strategy
- GitHub App integration
- NEVER-001, 002, 004, 005 full evidence display (they exist but may not be highlighted in demo)
- Detailed repair diff view
- Historical snapshot comparison

---

## 10. Sub-Tasks for Agent Mode

Each phase below is a discrete sub-task to execute in agent mode.

---

### Sub-Task 0: Monorepo Foundation + Schemas
**Intent**: Set up pnpm workspace, tsconfig, shared Zod schemas (including GraphState, ForbiddenCondition), empty JSON stubs.
**Relevant Context**: See Phase 0 above, Data Contracts section.
**Status**: [ ] pending

### Sub-Task 1: Mercury Demo Repository
**Intent**: Write Mercury domain + services + baseline tests with planted evidence signals.
**Relevant Context**: See Phase 1 above, Mercury Domain Model section.
**Status**: [ ] pending

### Sub-Task 2: Repository Analyzer
**Intent**: ts-morph extractors for transitions, guards, tests, comments → evidence.json + transitions.json. Normalizer maps Mercury fields → GraphState facts.
**Relevant Context**: See Phase 2 above. Must consume packages/schemas.
**Status**: [ ] pending

### Sub-Task 3: Graph Engine
**Intent**: Build domain-agnostic graph, BFS over GraphState, ForbiddenCondition evaluation, witness extraction, comparator.
**Relevant Context**: See Phase 3 above. Must not reference Mercury field names.
**Status**: [ ] pending

### Sub-Task 4: Witness Generator + Vitest Runner
**Intent**: Template-based Vitest generator + executor with ProofReceipt output.
**Relevant Context**: See Phase 4 above. Action-to-import mapping is Mercury-specific config, not embedded in generator.
**Status**: [ ] pending

### Sub-Task 5: Bob Skill + MCP Server
**Intent**: SKILL.md + .bob/mcp.json + MCP server with 9 tools. All tools delegate to packages.
**Relevant Context**: See Phase 5 above.
**Status**: [ ] pending

### Sub-Task 6: Golden Demo Wiring
**Intent**: Add support.service.ts, run full golden path with Bob, capture screenshots.
**Relevant Context**: See Phase 6 above. 13-step verification checklist.
**Status**: [ ] pending

### Sub-Task 7: Dashboard
**Intent**: Next.js dashboard reading .nevergraph/ JSON, @xyflow/react graph canvas.
**Relevant Context**: See Phase 7 above. Read-only, scenario switching via ?scenario= query param.
**Status**: [ ] pending

### Sub-Task 8: Polish + AGENTS.md
**Intent**: README, AGENTS.md, bob_sessions organization, visual polish.
**Relevant Context**: See Phase 8 above.
**Status**: [ ] pending

---

## Execution Order

```
PHASE 0 — Monorepo Foundation + Schemas          (no dependencies)

PHASE 1 — Mercury Safe Baseline + Tests          (depends on: Phase 0)

PHASE 2 — ts-morph Analyzer                      (depends on: Phases 0, 1)

PHASE 3 — Generic Graph Engine + BFS             (depends on: Phase 2 — analyzer contract locked first)

PHASE 4 — Witness Generation + Vitest Runner     (depends on: Phases 0, 1, 3)

PHASE 5 — NeverGraph Bob Skill + MCP Server      (depends on: Phases 2, 3, 4)

PHASE 6 — Golden Demo End-to-End with Bob        (depends on: all of Phases 1–5)

PHASE 7 — Dashboard                              (depends on: Phase 6 — real .nevergraph/ JSON needed)

PHASE 8 — Polish, README, Bob Sessions           (depends on: Phase 7)
```

**Phases execute strictly sequentially. No parallel work.**
**First phase to execute after plan approval: PHASE 0**
