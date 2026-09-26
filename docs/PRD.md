# NeverGraph
## The Negative Specification Compiler

**Version:** 1.0  
**Status:** MVP Scope Locked  
**Hackathon:** IBM Bob 2.0 Hackathon 2026  
**Product Type:** Developer Tool — Local Analysis Engine + Web Dashboard + IBM Bob Workflow  
**Primary Stack:** TypeScript / Next.js / IBM Bob / MCP / ts-morph / Vitest / React Flow

---

# 1. Executive Summary

NeverGraph is a developer tool that discovers what a software system has implicitly learned **must never happen**.

Modern repositories contain years of hidden engineering knowledge spread across guards, validation code, negative tests, state transitions, thrown errors, comments, schema constraints, and bug fixes.

Examples include:

- A refunded order must never become shipped.
- A cancelled payment must never return to captured.
- A user from Tenant A must never access Tenant B's resources.
- A permanently deleted account must never become active again.
- An approved invoice must never silently change its total.

These rules are rarely documented as a complete specification.

NeverGraph uses **IBM Bob** to recover these latent negative invariants from repository evidence and compiles them into a machine-checkable **Negative Specification** represented as a **NeverGraph**.

When code changes, NeverGraph determines whether a previously impossible forbidden state has become reachable.

If so, it finds the shortest violating sequence, generates an executable regression test, proves the violation by running the test, assists IBM Bob in producing a minimal repair, and verifies that the forbidden state has become unreachable again.

The core product promise is:

> **Recover what your software has learned must never happen. Prove every new change still cannot make it happen.**

---

# 2. Problem

Software accumulates hidden business knowledge over time.

A developer may see:

```ts
if (order.refundedAt) {
  throw new InvalidTransitionError();
}
```

A test may contain:

```ts
expect(() => ship(refundedOrder)).toThrow();
```

A database model may preserve:

```ts
refundedAt: Date | null
```

A comment may say:

```ts
// Refunded orders are terminal.
```

Individually, these are implementation details.

Collectively, they encode an important business invariant:

> A refunded order must never become shipped.

The problem is that this knowledge is fragmented and usually not represented as a first-class artifact.

As software evolves, especially with AI-generated changes, a new feature can unintentionally create a path around the old protections while:

- compilation succeeds;
- lint succeeds;
- existing unit tests succeed;
- individual changed functions appear correct;
- code review misses the cross-feature interaction.

The failure is not necessarily inside one line of code.

The failure is that a state that was previously **unreachable** has become **reachable**.

---

# 3. Product Thesis

Most developer tools ask:

> What should this software do?

NeverGraph asks:

> What has this software spent years making impossible?

This creates a second specification of the system:

**Positive Specification**

```text
What the system should do.
```

**Negative Specification**

```text
What the system must never be capable of doing.
```

NeverGraph automatically recovers the second specification.

---

# 4. Core Innovation

NeverGraph combines six capabilities into one workflow:

### 4.1 Latent Negative Invariant Discovery

IBM Bob reasons across structured repository evidence and infers rules that were never explicitly supplied by the developer.

Example:

```text
NEVER-003

A refunded order must never become shipped.
```

### 4.2 Evidence-Backed Inference

Every inferred invariant must cite concrete repository evidence.

Example:

```text
shipment.service.ts:41
refund.service.ts:72
order.spec.ts:122
order.ts:88
```

NeverGraph must never present an invariant solely because an LLM believes it sounds reasonable.

### 4.3 Negative Specification Compilation

Inferred invariants are converted into a structured machine-readable representation.

### 4.4 Forbidden-State Reachability Analysis

State transitions extracted from the repository are compiled into a graph.

NeverGraph searches the graph for paths leading to forbidden states.

### 4.5 Minimum Executable Witness

If a forbidden state becomes reachable, NeverGraph finds the shortest known sequence of actions that reproduces it.

### 4.6 Repair and Re-verification

IBM Bob receives the evidence and counterexample, creates a minimal repair, and NeverGraph reruns the witness to verify that the forbidden state is unreachable.

---

# 5. Product Positioning

NeverGraph is **not**:

- a generic AI code reviewer;
- a vulnerability scanner;
- a test coverage tool;
- a mutation-testing platform;
- a static call graph visualizer;
- a normal state-machine builder;
- an AI bug prediction system;
- a generic adversarial test generator.

NeverGraph is:

> **A compiler for the negative specification hidden inside an existing codebase.**

---

# 6. Primary User

The MVP targets software developers working on stateful TypeScript applications.

Ideal users include developers maintaining:

- commerce systems;
- payment workflows;
- SaaS applications;
- approval workflows;
- account lifecycle systems;
- order management systems;
- multi-step business processes.

The hackathon MVP specifically supports one controlled TypeScript repository called **Mercury Commerce**.

---

# 7. Primary User Journey

The primary NeverGraph workflow is:

```text
SELECT REPOSITORY

        ↓

SCAN REPOSITORY

        ↓

EXTRACT EVIDENCE

        ↓

RECOVER LATENT NEVER RULES

        ↓

COMPILE NEGATIVE SPECIFICATION

        ↓

BUILD NEVERGRAPH

        ↓

ANALYZE CHANGE

        ↓

SEARCH FOR FORBIDDEN PATHS

        ↓

FORBIDDEN STATE FOUND?

      ↙             ↘

    NO               YES

    ↓                 ↓

  SAFE       FIND MINIMUM WITNESS

                      ↓

               GENERATE TEST

                      ↓

                 RUN TEST

                      ↓

              VIOLATION PROVEN

                      ↓

             REPAIR WITH BOB

                      ↓

                  VERIFY

                      ↓

           NEGATIVE SPEC PRESERVED
```

---

# 8. Golden Demo Scenario

The entire MVP must optimize for one flawless demonstration.

## Initial Mercury behavior

Mercury contains an order lifecycle:

```text
CREATED
   │
   ▼
 PAID
 ├────────────► SHIPPED
 │
 ▼
REFUNDED

CANCELLED
```

Existing repository code contains multiple signals implying:

> **NEVER-003: A refunded order must never become shipped.**

However, this sentence is never provided directly to NeverGraph.

NeverGraph must infer it.

## Repository evidence

Example evidence may include:

```text
shipment.service.ts
blocks shipping when refundedAt exists

refund.spec.ts
expects shipping refunded orders to fail

order.ts
preserves refundedAt independently of status

shipment.service.ts comment
"Refunded orders are terminal"
```

## New feature

A developer requests:

> Add support for customer support agents to restore cancelled orders.

The feature introduces:

```text
CANCELLED
    │
    ▼
RESTORED
    │
    ▼
PAID
```

But the restore implementation fails to preserve the semantic restriction caused by `refundedAt`.

Existing tests still pass.

```text
143 / 143 PASS
```

## NeverGraph analysis

NeverGraph detects:

```text
NEGATIVE SPECIFICATION REGRESSION

NEVER-003 became reachable.
```

Minimum witness:

```text
createOrder()
     ↓
pay()
     ↓
refund()
     ↓
cancel()
     ↓
restore()
     ↓
ship()
     ↓
SHIPPED + refundedAt != null
```

## Executable proof

NeverGraph generates a Vitest regression test.

Before repair:

```text
FAIL

Expected shipping to be rejected.
Received SHIPPED.

FORBIDDEN BEHAVIOR REPRODUCED
```

## Repair

IBM Bob receives:

- inferred invariant;
- repository evidence;
- minimum witness;
- failing regression test.

Bob implements the minimum safe repair.

Example:

```ts
if (order.refundedAt) {
  throw new InvalidStateTransition(
    "Refunded orders cannot be restored"
  );
}
```

## Verification

NeverGraph executes the same witness.

Result:

```text
restore()

BLOCKED
```

Final state:

```text
NEVER-003

Before feature:
UNREACHABLE ✓

After feature:
REACHABLE ✕

After Bob repair:
UNREACHABLE ✓
```

Final message:

> **Negative Specification Preserved**

---

# 9. Functional Requirements

## FR-001 — Repository Selection

The system shall allow a predefined/local TypeScript repository to be selected for analysis.

### MVP Acceptance

The Mercury repository can be loaded reliably without authentication, cloud sync, or GitHub integration.

---

## FR-002 — Repository Scanning

The analyzer shall inspect supported TypeScript files.

It shall identify candidate evidence from:

- functions;
- conditional guards;
- thrown errors;
- state mutations;
- enum/string state values;
- negative tests;
- comments;
- validation logic.

### MVP Acceptance

The scanner returns structured repository evidence with file names and source locations.

---

## FR-003 — Transition Extraction

The analyzer shall identify supported state-changing operations.

Example:

```ts
order.status = "PAID";
```

shall produce approximately:

```json
{
  "action": "restoreOrder",
  "from": "CANCELLED",
  "to": "PAID"
}
```

### MVP Acceptance

All state transitions required for the Mercury golden path are correctly extracted.

---

## FR-004 — Evidence Model

Repository evidence shall be normalized before AI reasoning.

Every evidence item should contain:

```text
id
type
file
line
symbol
snippet/summary
metadata
```

Supported evidence types for MVP:

```text
guard
state_transition
negative_test
throw
comment
constraint
```

---

## FR-005 — Latent Negative Invariant Discovery

IBM Bob shall analyze normalized evidence and infer candidate negative invariants.

Bob must not require the user to manually define the golden-demo invariant.

Example output:

```text
NEVER-003
A refunded order must never become shipped.
```

---

## FR-006 — Evidence Threshold

A high-confidence invariant must be supported by at least two independent evidence signals.

Preferred evidence strength:

```text
1 source         LOW
2 sources        MEDIUM
3+ sources       HIGH
```

This heuristic may be customized for the MVP but must remain deterministic.

---

## FR-007 — Structured AI Output Validation

All Bob-generated invariant structures consumed by the engine must pass Zod validation.

Invalid structures must fail closed.

The graph engine must never consume arbitrary unvalidated AI output.

---

## FR-008 — Negative Specification

NeverGraph shall persist inferred rules in a structured specification.

Conceptual schema:

```ts
interface NeverRule {
  id: string;
  description: string;
  confidence: "low" | "medium" | "high";
  forbiddenCondition: ForbiddenCondition;
  evidence: EvidenceReference[];
}
```

---

## FR-009 — NeverGraph Generation

The graph engine shall generate:

```text
State Nodes
Transition Edges
Forbidden Conditions
Reachability Status
```

The graph shall be renderable in the dashboard.

---

## FR-010 — Change Analysis

NeverGraph shall support comparison between a safe baseline and a changed repository state.

For the MVP, this may use:

- predefined snapshots;
- Git diff;
- controlled demo branches;
- deterministic fixture files.

Production-grade Git integration is not required.

---

## FR-011 — Forbidden-State Search

The graph engine shall perform bounded reachability analysis.

The MVP shall use breadth-first search when appropriate to find the shortest known violating transition sequence.

NeverGraph must describe this accurately as bounded behavioral exploration and must not claim complete formal verification.

---

## FR-012 — Minimum Witness

For every reproduced violation, NeverGraph shall generate a sequence such as:

```text
create
pay
refund
cancel
restore
ship
```

The witness shall contain enough information to generate an executable test.

---

## FR-013 — Executable Regression Test

NeverGraph shall generate a Vitest test representing the witness.

The test must fail against the buggy implementation.

A warning without executable reproduction does not qualify as a successful golden-demo detection.

---

## FR-014 — Proof Execution

The system shall execute the generated regression test and capture:

```text
command
status
expected behavior
actual behavior
stdout/stderr summary
```

Dashboard status shall distinguish:

```text
Suspected
Reproduced
Fixed
Verified
```

---

## FR-015 — Bob Repair Workflow

IBM Bob shall receive sufficient context to repair a reproduced violation.

Context shall include:

```text
Never Rule
Evidence
Affected code
Minimum witness
Failing regression test
```

Bob shall be instructed to produce the smallest safe repair rather than broad refactoring.

---

## FR-016 — Re-verification

After repair, NeverGraph shall rerun:

```text
generated regression test
+
existing relevant tests
```

Success requires both to pass.

---

## FR-017 — Permanent Regression Artifact

The executable counterexample shall remain in the repository after repair as a regression test.

The failure becomes permanent institutional knowledge.

---

## FR-018 — Proof Receipt

NeverGraph shall generate a final proof summary.

Example:

```text
NeverGraph Proof Receipt

Rule:
NEVER-003

Negative invariant:
Refunded orders must never become shipped.

Violation found:
YES

Minimum witness:
6 transitions

Executable reproduction:
CONFIRMED

Repair:
APPLIED

Witness after repair:
BLOCKED

Existing tests:
PASS

Negative specification:
PRESERVED
```

---

# 10. IBM Bob Requirements

IBM Bob must be a core component of the NeverGraph workflow, not merely a tool used to create the UI.

Bob shall be used for high-value tasks including:

### Repository Understanding

Bob reasons about code semantics using repository context and structured analyzer evidence.

### Negative Invariant Synthesis

Bob converts multiple weak repository signals into candidate latent negative invariants.

### Evidence Explanation

Bob explains why each inferred Never Rule exists.

### Counterexample Test Construction

Bob may translate machine-generated witnesses into idiomatic executable tests.

### Repair

Bob analyzes confirmed violations and implements minimal repairs.

### Verification Workflow

Bob coordinates NeverGraph MCP calls and test execution to confirm the repair.

---

# 11. Bob Project Configuration

The repository should contain project-level Bob configuration.

Target structure:

```text
.bob/
├── mcp.json
└── skills/
    └── nevergraph/
        └── SKILL.md
```

The NeverGraph skill shall instruct Bob to:

- never claim a rule without repository evidence;
- distinguish discovered rules from user-provided assumptions;
- prefer multiple independent evidence sources;
- emit structured output;
- never claim a violation until an executable or deterministic witness supports it;
- prefer minimal repairs;
- always re-run the original witness after repair.

---

# 12. Bob Subagent Strategy

Where practical, Bob may delegate repository exploration into focused subagents.

Suggested responsibilities:

```text
State Miner
Find state transitions and lifecycle logic.

Guard Miner
Find defensive checks and thrown errors.

Test Miner
Find negative and regression tests.

Invariant Synthesizer
Combine evidence into candidate Never Rules.

Repair Investigator
Analyze the confirmed witness and propose minimal fixes.
```

Subagent use must remain purposeful.

The product must not spawn subagents merely for presentation value.

---

# 13. MCP Requirements

NeverGraph shall expose its deterministic engine to IBM Bob through a local MCP server.

Required MVP tools:

```text
scan_repository

get_repository_evidence

get_transitions

get_never_rules

build_nevergraph

analyze_change

find_counterexample

run_witness

verify_rule
```

Optional if time allows:

```text
get_rule_evidence

generate_proof_receipt
```

The deterministic graph operations should live inside NeverGraph, while Bob performs semantic reasoning.

---

# 14. System Architecture

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

# 15. Technology Stack

```text
Language
TypeScript

Runtime
Node.js LTS

Package Manager
pnpm workspace

Dashboard
Next.js

UI
Tailwind CSS
shadcn/ui
Lucide

Graph Visualization
@xyflow/react

Static Analysis
ts-morph

Validation
Zod

Graph / Reachability
Custom TypeScript

Shortest Witness
BFS / bounded search

Testing
Vitest

AI Workflow
IBM Bob IDE

Bob Extension
Bob Skills

Tool Integration
MCP

Storage
Local JSON

Demo Application
Mercury Commerce
```

---

# 16. Repository Structure

```text
nevergraph/
│
├── apps/
│   └── dashboard/
│
├── packages/
│   ├── analyzer/
│   ├── graph/
│   ├── schemas/
│   └── runner/
│
├── mcp/
│   └── server/
│
├── demo/
│   └── mercury/
│
├── .bob/
│   ├── mcp.json
│   └── skills/
│       └── nevergraph/
│           └── SKILL.md
│
├── .nevergraph/
│   ├── evidence.json
│   ├── transitions.json
│   ├── rules.json
│   └── proofs/
│
├── bob_sessions/
│
├── pnpm-workspace.yaml
└── README.md
```

---

# 17. Dashboard Requirements

The dashboard must prioritize storytelling over feature count.

## Primary Dashboard Sections

### Repository Header

Display:

```text
Repository
Branch / Scenario
Number of recovered Never Rules
Current violations
```

### Negative Specification Panel

Show discovered rules.

Example:

```text
NEVER-003

Refunded orders must never
become shipped.

Evidence strength:
HIGH

4 independent signals
```

### Evidence Drawer

Display why NeverGraph inferred the rule.

### NeverGraph Visualization

Show:

- states;
- transitions;
- forbidden states;
- newly introduced transitions;
- violating path.

### Violation Panel

Display:

```text
Negative Specification Regression
```

with the affected Never Rule.

### Witness View

Show the minimum violating sequence visually.

### Proof Terminal

Display actual test execution.

### Repair Status

Display before/after verification.

---

# 18. Visual Design Direction

NeverGraph should visually resemble a premium developer tool rather than a generic AI SaaS dashboard.

Design principles:

```text
Dark-first
High information density
Minimal gradients
Strong typography
Monospace for technical artifacts
Graph-first visualization
Limited animation
Clear success / danger states
```

Primary inspiration:

```text
Linear
GitHub
Vercel
Sentry
modern observability tools
```

The product must avoid unnecessary:

```text
marketing carousels
hero illustrations
fake analytics charts
user profile screens
billing screens
settings complexity
```

---

# 19. Mercury Demo Repository

Mercury exists specifically to demonstrate the NeverGraph concept clearly.

It shall contain:

```text
Order lifecycle
Payment lifecycle
Refund logic
Cancellation
Shipment
Support restoration
Vitest tests
Repository comments and guards
```

At least 4–6 latent Never Rules should be recoverable.

Example candidates:

```text
NEVER-001
Cancelled orders must never become shipped.

NEVER-002
Unpaid orders must never become shipped.

NEVER-003
Refunded orders must never become shipped.

NEVER-004
Refunded payments must never be captured again.

NEVER-005
Finalized shipment data must never reference an unpaid order.
```

Only one rule must power the golden violation demo.

The remaining rules exist to make the product look like a real system rather than a hard-coded single check.

---

# 20. Anti-Hardcoding Requirement

The golden demo may use a controlled repository and deterministic fixtures, but NeverGraph must preserve the architectural separation between:

```text
Repository Evidence
        ↓
Invariant Discovery
        ↓
Structured Never Rule
        ↓
Graph Evaluation
```

Forbidden behavior must not be represented solely as:

```ts
if (scenario === "demo") {
  return violation;
}
```

At minimum, the core rule, path, and executable test must be derived from actual repository structures or validated structured artifacts.

---

# 21. Reliability Requirements

NeverGraph shall fail closed when:

- Bob returns malformed structured output;
- repository evidence is missing;
- graph transitions cannot be parsed;
- the test command fails for infrastructure reasons;
- no executable witness can be reproduced.

The system must distinguish:

```text
Violation confirmed

from

Violation suspected

from

Analysis failed
```

NeverGraph must never label an unverified hypothesis as a confirmed violation.

---

# 22. Security Requirements

The MVP is local-first.

NeverGraph should not require:

```text
GitHub OAuth
user accounts
cloud repository upload
production secrets
external database credentials
personal information
```

No real client/company repository or confidential dataset shall be used for the hackathon demo.

Mercury shall be synthetic.

---

# 23. Persistence

MVP persistence uses local JSON.

Example:

```text
.nevergraph/
├── repository.json
├── evidence.json
├── transitions.json
├── rules.json
├── analysis.json
└── proofs/
    └── NEVER-003.json
```

A production database is explicitly unnecessary for MVP.

---

# 24. Performance Targets

For the controlled Mercury demo:

```text
Initial repository analysis:
target < 10 seconds excluding Bob reasoning

Graph generation:
target < 1 second

Reachability analysis:
target < 1 second

Dashboard transition:
perceived immediate

Witness test:
target < 5 seconds
```

These are demo targets, not production SLAs.

---

# 25. Success Metrics

The MVP is successful if the demo proves all of the following:

```text
1. No manual definition of NEVER-003 is required.

2. NeverGraph recovers NEVER-003 from repository evidence.

3. Evidence explaining the inference is visible.

4. The safe baseline reports NEVER-003 unreachable.

5. A new feature makes NEVER-003 reachable.

6. Existing tests still pass before NeverGraph generates its witness.

7. NeverGraph finds the violating sequence.

8. The generated executable test fails against the buggy code.

9. IBM Bob produces a repair based on the proof.

10. The same witness is blocked after repair.

11. Existing relevant tests remain green.

12. The generated regression test remains in the repository.
```

If any of items 1–10 fail during the recorded demo, the golden path is considered incomplete.

---

# 26. Out of Scope for Hackathon MVP

The following are explicitly out of scope:

```text
GitHub App production integration

GitHub OAuth

multi-user accounts

billing

organization management

PostgreSQL

Supabase

Redis

Docker orchestration

Kubernetes

multi-language analysis

Python analysis

Java analysis

Go analysis

Rust analysis

arbitrary repository support

production-scale model checking

complete formal verification

distributed systems exploration

CI marketplace integration

automatic PR blocking

historical Git mining

production telemetry ingestion

cloud-hosted repository execution

real enterprise repositories
```

These features must not be implemented until the golden demo is complete.

---

# 27. Hackathon Bob Evidence Requirement

All relevant IBM Bob task-session summary screenshots must be stored in:

```text
bob_sessions/
```

Recommended evidence tasks:

```text
task01_architecture_summary.png

task02_mercury_repository_analysis.png

task03_negative_invariant_discovery.png

task04_graph_engine_and_mcp.png

task05_counterexample_generation.png

task06_repair_and_verification.png
```

Bobcoins should primarily be spent on tasks that demonstrate meaningful repository reasoning and workflow automation.

Do not waste Bob usage on cosmetic UI work that can be implemented deterministically.

---

# 28. Recommended Bob Workflow

### Phase A — Plan

Use Bob Plan mode to understand this PRD and generate the implementation plan.

Bob must not change product scope.

### Phase B — Foundation

Create:

```text
pnpm monorepo
Next.js dashboard
shared schemas
Mercury demo repo
test baseline
```

### Phase C — Analyzer

Implement:

```text
ts-morph scanning
transition extraction
guard extraction
test evidence extraction
```

### Phase D — NeverGraph Core

Implement:

```text
NeverRule schemas
graph representation
bounded BFS
counterexample model
proof model
```

### Phase E — IBM Bob Integration

Implement:

```text
NeverGraph skill
MCP server
structured invariant workflow
```

### Phase F — Proof Pipeline

Implement:

```text
witness generation
Vitest regression generation
test execution
proof receipt
```

### Phase G — Repair Demo

Introduce the support restore feature and prove:

```text
Safe
→ Regressed
→ Reproduced
→ Repaired
→ Verified
```

### Phase H — Polish

Only after the complete workflow works:

```text
React Flow visualization
animations
terminal presentation
landing copy
README
demo video
```

---

# 29. Implementation Priority

## P0 — Must Work

```text
Mercury baseline
Never rule discovery
evidence display
state graph
change scenario
forbidden reachability
minimum witness
failing executable test
Bob repair
successful re-verification
dashboard golden path
bob_sessions evidence
```

## P1 — Strongly Desired

```text
Multiple discovered Never Rules
React Flow animations
Proof Receipt
Bob MCP tools
NeverGraph Skill
good README
polished demo state switching
```

## P2 — Only If Everything Else Is Finished

```text
real arbitrary local repository selector
Git diff automation
additional domains
CLI
Bob Shell
deployment integrations
GitHub comments
```

---

# 30. Demo Script Product Requirements

The product must support a demo approximately structured as follows:

### Scene 1 — The Hidden Specification

Open Mercury.

NeverGraph reports:

```text
14 latent NEVER rules recovered.
```

Open NEVER-003.

Show evidence from multiple repository locations.

Message:

> Nobody gave NeverGraph this rule.

### Scene 2 — Harmless Feature

Show request:

```text
Add support for restoring cancelled orders.
```

Existing tests:

```text
PASS
```

### Scene 3 — Negative Specification Regression

NeverGraph displays:

```text
NEVER-003 became reachable.
```

Animate the violating graph path.

### Scene 4 — Minimum Witness

Show:

```text
create
pay
refund
cancel
restore
ship
```

### Scene 5 — Executable Proof

Run generated test.

Show real failure.

### Scene 6 — Bob Repair

Show IBM Bob receiving the NeverGraph evidence and implementing the minimum repair.

### Scene 7 — Verification

Rerun witness.

Show:

```text
BLOCKED
```

Final frame:

```text
NEVER-003

Before Change     UNREACHABLE ✓
After Feature     REACHABLE ✕
After Bob Repair  UNREACHABLE ✓

NEGATIVE SPECIFICATION PRESERVED
```

---

# 31. Product Messaging

## Product Name

**NeverGraph**

## Category

**Negative Specification Compiler**

## Primary Tagline

**Recover what your software has learned must never happen.**

## Secondary Tagline

**Prove every new change still can't make it happen.**

## One-Sentence Pitch

NeverGraph uses IBM Bob to recover undocumented negative invariants from repository evidence, compiles them into a forbidden-behavior graph, and proves whether new code makes previously impossible states reachable.

## 30-Second Pitch

Every mature codebase contains two specifications: what the software should do, and everything years of bugs, tests, guards, and constraints have taught it must never do. The second specification is almost never written down. NeverGraph uses IBM Bob to recover that hidden knowledge, compile it into a machine-checkable negative specification, and test every new change against it. When a forbidden state becomes reachable, NeverGraph doesn't just warn you—it finds the shortest counterexample, turns it into an executable regression test, lets Bob repair the code, and proves the forbidden state is impossible again.

---

# 32. Product Principles

### Evidence Before Claims

NeverGraph should prefer:

```text
"I cannot prove this."
```

over:

```text
"This looks dangerous."
```

without sufficient evidence.

### Proof Before Repair

Do not repair a suspected bug before reproducing the forbidden behavior.

### Repository Knowledge Over Generic Best Practices

Never Rules should primarily represent knowledge derived from the analyzed software, not generic advice supplied by the model.

### Minimum Counterexample

Prefer the shortest understandable reproducing sequence.

### Minimum Repair

Repair only what is necessary to restore the invariant.

### Preserve the Lesson

Every confirmed counterexample becomes a permanent regression test.

---

# 33. Definition of Done

NeverGraph MVP is DONE only when the following complete end-to-end workflow works reliably from a clean repository state:

```text
Mercury safe baseline loads
        ↓
NeverGraph discovers NEVER-003 automatically
        ↓
Evidence is displayed
        ↓
Baseline graph marks rule unreachable
        ↓
Support Restore change is introduced
        ↓
Original test suite remains green
        ↓
NeverGraph identifies newly reachable forbidden state
        ↓
Shortest witness is produced
        ↓
Executable Vitest regression is generated
        ↓
Regression test fails
        ↓
IBM Bob receives proof and repairs implementation
        ↓
Generated regression passes
        ↓
Existing relevant tests pass
        ↓
Graph returns to unreachable
        ↓
Proof Receipt shows VERIFIED
```

Everything else is secondary.

---

# 34. Final Product Statement

NeverGraph is built around one idea:

> Software remembers the failures it has survived.

That memory is currently scattered across guards, tests, constraints, comments, state machines, and defensive code.

As AI enables software to change faster than ever, that hidden memory becomes easier to accidentally erase.

NeverGraph uses IBM Bob to turn it into an explicit, executable **Negative Specification**.

The product does not merely ask whether new code looks correct.

It asks something harder:

> **Did this change make something possible that this software had learned must never happen?**

And when the answer is yes, NeverGraph proves it.