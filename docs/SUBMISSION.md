# NeverGraph — Submission Copy

Reusable copy blocks for the **IBM Bob 2.0 Hackathon 2026** submission.

Every claim here is supported by artifacts in this repository. Paste the block
that fits the field you're given; the variants are written to stay consistent
with each other.

---

## Project Name

```
NeverGraph
```

## Category

```
The Negative Specification Compiler
```

## Tagline (~100 characters)

```
Recover what your software has learned must never happen — and prove changes can't make it happen.
```

*(98 characters)*

Shorter alternative (~60 characters):

```
Recover what your software has learned must never happen.
```

## One-line Summary

```
NeverGraph uses IBM Bob to recover latent negative invariants from repository
evidence, compiles them into machine-evaluable forbidden conditions, and proves
whether a code change makes one reachable.
```

---

## ~50-word Summary

```
Mature codebases carry an unwritten specification: everything they've learned
must never happen. NeverGraph uses IBM Bob to recover those latent negative
invariants from repository evidence, compiles them into machine-checkable
forbidden conditions, and proves whether a new change makes one reachable —
returning a minimum counterexample and an executable regression test.
```

*(50 words)*

## ~150-word Summary

```
Every mature repository has two specifications. The first is written down: what
the software should do. The second never is — everything years of bugs, guards
and negative tests have taught it must never happen. That knowledge is scattered
across the codebase, so a reasonable new feature can make a previously impossible
state reachable while every existing test still passes.

NeverGraph recovers the second specification. IBM Bob reads structured evidence
extracted by a ts-morph analyzer and synthesizes latent negative invariants,
grounded in specific evidence and validated against Zod contracts. NeverGraph
compiles each one into a machine-evaluable forbidden condition and builds a
context-aware behavior graph whose nodes are (status, facts) tuples rather than
status strings.

A bounded BFS then determines reachability. When a forbidden state is reachable,
NeverGraph returns the minimum counterexample, generates it as a runnable Vitest
test, and executes it — turning a prediction into a demonstrated violation.
```

*(149 words)*

## ~300-word Full Description

```
Every mature repository carries two specifications. The first one is written
down: what the software should do. The second one almost never is — everything
years of incidents, bug fixes and code review have taught the system it must
never be able to do. That knowledge doesn't disappear; it gets scattered across
guard clauses, negative tests, thrown errors, and historical facts preserved on
records long after they stop being current. Nobody owns it, and no artifact
states it. So when someone ships a reasonable feature months later, a behavior
that was previously impossible can quietly become reachable — while every
existing test still passes, because no test was ever written for a state nobody
thought could exist.

NeverGraph recovers that second specification and compiles it into something a
machine can check. A deterministic ts-morph analyzer extracts structured evidence
from a TypeScript repository. IBM Bob reads that evidence and synthesizes
candidate negative invariants, citing specific evidence ids and reasoning about
what the code has implicitly learned. Every rule passes Zod validation,
evidence-reference resolution and a confidence policy before it is accepted — Bob
reasons, but deterministic code decides.

Each rule compiles into a forbidden condition such as { targetState: "SHIPPED",
requiredFacts: { refundedAt: true } }. NeverGraph builds a context-aware behavior
graph whose nodes are (status, facts) tuples, so two states sharing a lifecycle
status but differing in accumulated history remain distinct — which is exactly
the distinction that hides this class of violation. A bounded BFS then searches
for reachability.

In the demo, Bob recovered five latent invariants from 33 evidence items. A new
"restore cancelled order" feature — fully guarded, fully tested — made one of
them reachable in five transitions. NeverGraph produced the minimum
counterexample, generated it as a Vitest test, and reproduced the violation. One
guard later, the same test passed and the state was unreachable again.
```

*(310 words)*

---

## Problem

```
Mature codebases accumulate negative knowledge — everything they've learned must
never happen — but that knowledge is never written down. It exists only as a
pattern distributed across guards, negative tests, thrown errors and preserved
historical facts.

Because no artifact states it, nothing checks it. A reasonable new feature can
make a previously impossible behavior reachable while the entire existing test
suite stays green, because no test was ever written for a state nobody believed
could exist.

Conventional tooling does not catch this. Coverage is satisfied. Types are
satisfied. Static analysis sees valid code. The bug is not in any single
function — it's in a behavioral path that only becomes possible once a new
transition is introduced.
```

## Solution

```
NeverGraph is a Negative Specification Compiler. It works in three stages:

DISCOVER — a ts-morph analyzer extracts structured evidence (guards, throws,
negative tests, state transitions) from a TypeScript repository. IBM Bob reads
that evidence and recovers the latent negative invariants it implies, grounding
every rule in cited evidence.

COMPILE — each recovered rule becomes a machine-evaluable forbidden condition,
validated against shared Zod contracts. NeverGraph builds a context-aware
behavior graph whose nodes are (status, facts) tuples, preserving the historical
context that a status-only model would discard.

PROVE — a bounded BFS determines whether any reachable state satisfies a
forbidden condition. When one does, NeverGraph extracts the minimum
counterexample, generates it as an executable Vitest regression test, and runs
it. A passing graph result is a prediction; a failing generated test is a
demonstrated violation.

After a repair, the same generated test is re-run and the search repeated —
giving deterministic before/after verification.
```

## How IBM Bob Is Used

```
IBM Bob is the semantic reasoning layer of the product and was central to
building it.

In the product:
- Semantic invariant recovery. Bob reads structured analyzer evidence and
  synthesizes candidate NeverRule objects with explicit reasoning. All five rules
  in .nevergraph/rules.json came from Bob — none is hardcoded, and no rule
  identity appears anywhere in the analyzed source, the analyzer, or the graph
  engine.
- The NeverGraph Bob Skill (.bob/skills/nevergraph/SKILL.md) encodes
  non-negotiable constraints: evidence before invariant, multiple independent
  signals before high confidence, and an absolute ban on claiming reachability
  from natural-language reasoning. Reachability is decided only by the BFS
  engine.
- MCP integration. mcp/server exposes the deterministic pipeline to Bob as nine
  tools, each a thin wrapper that implements no logic of its own.

In building the project:
- Architecture planning and PRD audit
- Mercury demo repository baseline implementation
- ts-morph repository analyzer implementation
- Bob Skill authoring
- Negative-invariant synthesis
- MCP server integration

Written session evidence is preserved in bob_sessions/ (four sessions).

Attribution note: the final one-guard repair in Phase 6 was NOT authored by IBM
Bob — the hackathon Bob budget was exhausted before that step, and the repair was
applied manually. What the project demonstrates is that NeverGraph verified the
repair: the same generated regression test that reproduced the violation passed
afterwards, and the bounded search reported the forbidden state unreachable
again.
```

## Key Innovation

```
NeverGraph discovers the rule before it discovers the bug.

It does not start from a failure, a stack trace, or a diff. It starts from
evidence that predates the change, recovers an explicit negative specification
from it, and only then asks whether anything violated it. That ordering is what
makes the result meaningful rather than hindsight pattern-matching.

Four things have to hold together for this to work:

1. Automatic latent negative-invariant discovery — recovered from evidence, not
   authored by a human or hardcoded.
2. Negative-specification compilation — rules become machine-evaluable forbidden
   conditions, not prose warnings.
3. Context-aware behavioral reachability — graph nodes are (status, facts)
   tuples. A status-only graph provably cannot see the demo violation.
4. Minimum executable counterexample — the shortest violating path, emitted as a
   runnable test that actually fails.

The output is a demonstrated violation and a regression test, not a severity
score.
```

## Technical Architecture

```
TypeScript repository (demo/mercury)
  → packages/analyzer      ts-morph AST extraction → evidence + transitions
  → IBM Bob                semantic synthesis of latent negative invariants
  → mcp/server             validation gate: Zod + evidence refs + confidence cap
  → .nevergraph/rules.json validated, persisted Never Rules
  → packages/graph         context-aware behavior graph + bounded BFS
  → minimum counterexample shortest violating transition sequence
  → packages/runner        Vitest test generation + process execution
  → executable proof       reproduced / not_reproduced
  → apps/dashboard         read-only presentation of captured artifacts

packages/schemas holds shared Zod contracts and sits between every stage. No
package passes unvalidated data to another, and nothing Bob produces reaches the
graph engine without passing schema validation.

Design boundary: Bob does reasoning, deterministic packages do computation. AST
extraction, BFS, test generation and execution contain no model calls. This is
what makes "unreachable" and "reproduced" reproducible rather than asserted.

pnpm workspace layout:
  apps/dashboard      Next.js 15 / React 19 / Tailwind 4 / @xyflow/react
  packages/schemas    Zod contracts (zero dependencies, built first)
  packages/analyzer   ts-morph static analysis
  packages/graph      graph engine + bounded BFS
  packages/runner     witness → Vitest generation + execution
  mcp/server          MCP tool surface for IBM Bob
  demo/mercury        synthetic analysis target
```

## Demo Flow

```
1. IBM Bob recovers five latent Never Rules from 33 analyzer evidence items.
   The golden rule: NEVER-005 — "A refunded order must never be shipped."
   High confidence, backed by a negative test, a guard and a throw.

2. Baseline. Bounded search explores 6 states. NEVER-005: UNREACHABLE.

3. A "restore cancelled order" support feature is added. It is guarded, it ships
   with passing tests, and the entire existing suite stays green.

4. Changed. Bounded search explores 11 states. NEVER-005: FOUND at depth 5.
   Minimum counterexample:
     payOrder → refundOrder → cancelOrder → restoreOrder → shipOrder
   Forbidden state reached: SHIPPED { refundedAt: true }.
   The cause: restoreOrder re-enters a shippable status without checking
   refundedAt, so the refund fact rides along.

5. Executable proof. The counterexample is generated as
   demo/mercury/tests/regression/NEVER-005.spec.ts and executed.
   Result: REPRODUCED, testResult fail, exit code 1.

6. Repaired. One guard added to restoreOrder. The same generated regression test
   is re-run: PASS / NOT_REPRODUCED, exit code 0. Bounded search: UNREACHABLE.

The dashboard renders all three scenarios from real captured deterministic
artifacts in .nevergraph/scenarios/.
```

## Current Limitations

```
- Bounded behavioral exploration, not formal verification. "Unreachable" means
  exhaustive over the extracted transition table within stated bounds (depth ≤ 10,
  ≤ 10,000 visited states) — not a mathematical proof about the program.
- Constrained TypeScript grammar. The analyzer targets a specific MVP syntax set
  for status assignments, guards and negative tests. Unsupported constructs
  (|| guard chains, negated nested expressions, truthy/falsy property guards,
  await-based negative-test expressions) are safely ignored rather than guessed,
  so evidence can be missed but is never fabricated.
- Test generation uses a domain adapter (packages/runner/src/adapters/mercury.ts).
  Generalizing witness-to-test emission to arbitrary repositories is not done.
- Single controlled demo domain. Mercury is a synthetic commerce repository built
  to make this class of violation demonstrable; NeverGraph has not been run
  against a large real-world codebase.
- The dashboard is read-only. It presents captured results and does not trigger
  analysis.
- The Phase 6 repair was applied manually, not authored by IBM Bob.
```

## Future Work

```
- Broaden the analyzer grammar (boolean guard chains, truthy/falsy property
  guards, async negative tests) to raise evidence recall.
- Replace the domain adapter with general witness-to-test emission driven by the
  analyzer's own transition metadata.
- Incremental re-analysis so a changed file re-verifies only the affected rules.
- Rule lifecycle: accepting, rejecting and versioning recovered invariants as the
  repository evolves.
- Additional target languages beyond TypeScript.
- Validation against a large real-world repository to measure evidence recall and
  false-positive rate — deliberately not claimed today, because it has not been
  measured.
```

## Tech Stack

```
Language      TypeScript 5.8
Runtime       Node.js 20+
Monorepo      pnpm workspaces
Contracts     Zod 4
Analysis      ts-morph 24
Testing       Vitest 3
Frontend      Next.js 15, React 19, Tailwind CSS 4
Graph UI      @xyflow/react 12, lucide-react
AI            IBM Bob + Model Context Protocol SDK 1.30
```

## Repository Instructions

```
Requires Node.js 20+ and pnpm 10.

  pnpm install
  pnpm build
  pnpm test

Run the dashboard:

  pnpm --filter @nevergraph/dashboard dev

Open http://localhost:3000. Switch scenarios in the UI, or directly:
  ?scenario=baseline | ?scenario=changed | ?scenario=repaired

Re-run the analyzer against the demo repository:

  pnpm analyze:mercury

Re-validate the recovered Never Rules:

  node validate-rules.mjs

Use from IBM Bob: build the MCP server, then open the project with Bob —
.bob/mcp.json registers the nevergraph server and
.bob/skills/nevergraph/SKILL.md activates the workflow skill.

  pnpm --filter @nevergraph/mcp-server build

Full documentation: README.md
Demo narration: docs/DEMO_SCRIPT.md
Product requirements: docs/PRD.md
IBM Bob session evidence: bob_sessions/
```

---

## Claims Checklist

Before pasting into any submission form, confirm the copy still satisfies these:

- [x] No fake benchmarks, percentages, user counts or timings.
- [x] No claim of formal verification — "bounded behavioral exploration" only.
- [x] No claim that IBM Bob authored the Phase 6 repair.
- [x] Bob's genuine contributions stated (rule recovery, skill, MCP, build work).
- [x] Limitations stated plainly rather than omitted.
- [x] Every number cited (5 rules, 33 evidence items, 6/11/6 states, depth 5,
      exit 1 / exit 0) is present in committed artifacts.
- [x] No competitor is named or attacked.
