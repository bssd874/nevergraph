# NeverGraph — Demo Narration Script

**Target length:** ~3:10 spoken (range 2:50–3:30)
**Setup:** dashboard running at `http://localhost:3000`, browser at 1080p or
1440p, scenario selector visible.

```bash
pnpm install
pnpm build
pnpm --filter @nevergraph/dashboard dev
```

Start on **Overview**, scenario **BASELINE**, rule **NEVER-005**.

Every number spoken below is on screen. Nothing in this script requires a claim
the dashboard does not display.

---

## 0:00 – 0:20 — Problem / hook

> **[Screen: dashboard Overview, baseline]**

"Every mature codebase has two specifications.

The first one is written down — what the software should do.

The second one never is: everything years of bugs and incidents have taught it
must **never** happen. That knowledge is scattered across guards, negative tests
and thrown errors. Nobody owns it.

So a reasonable new feature can make a previously impossible state reachable —
and every existing test still passes."

---

## 0:20 – 0:45 — Five latent rules recovered by IBM Bob

> **[Click: "Never Rules" in the left nav]**

"NeverGraph is a negative specification compiler.

IBM Bob read the analyzer's evidence for this repository and recovered five
latent negative invariants. Nobody told Bob these rules existed — there's no rule
text anywhere in the source it analyzed.

A shipped order must never be cancelled. A refunded order must never be paid
again. And the one we'll follow —"

> **[Point: NEVER-005 in the list]**

"— *a refunded order must never be shipped.*"

---

## 0:45 – 1:10 — NEVER-005 and its evidence

> **[Screen: NEVER-005 already selected, right-hand detail panel]**

"High confidence. And this is the part that matters — it's not prose.

Bob's rule gets compiled into a machine-evaluable forbidden condition:
state equals SHIPPED, **and** refundedAt is true."

> **[Click: "Evidence" in the left nav]**

"Three independent signals back it. A negative test the team wrote asserting
shipment of a refunded order must throw. A guard in the order service. And the
throw that guard raises.

None of those says the invariant. Together they're recoverable evidence of one."

---

## 1:10 – 1:35 — Safe baseline

> **[Click: "Overview". Scenario: BASELINE]**

"Here's the repository as it ships today.

NeverGraph builds a behavior graph and runs a bounded search. Six states
explored, and NEVER-005 is **unreachable**.

Note what the nodes are — not status strings. Each node is a status *plus* its
accumulated fact context. That will matter in about twenty seconds."

---

## 1:35 – 2:05 — The change

> **[Click: CHANGED in the scenario selector]**

"Now a support engineer adds a feature: restore a cancelled order back to paid.
It's guarded — only a cancelled order can be restored. It ships with its own
tests. **The entire existing suite stays green.**"

> **[Point: the red banner]**

"NeverGraph says: negative specification regression. NEVER-005 is now **found**."

> **[Point: two PAID nodes in the graph]**

"Look at these two nodes. Both are PAID. This one has `refundedAt` set — this one
doesn't. Same lifecycle status, different history, genuinely different states.

Collapse those into the string 'PAID' and this bug is invisible."

> **[Point: the highlighted path / Minimum Counterexample panel]**

"Minimum counterexample, five transitions: pay, refund, cancel, restore, ship.

`restoreOrder` never checked `refundedAt` — there was no reason to when it was
written. So the refund fact rides along into a shippable state."

> **[Point: the final red node]**

"Forbidden state reached. SHIPPED, with refundedAt true."

---

## 2:05 – 2:30 — Executable proof

> **[Click: "Proof" in the left nav]**

"A graph result is still a prediction. So NeverGraph writes the counterexample
out as a real Vitest file and runs it.

`NEVER-005.spec.ts`. Result: **reproduced**. Exit code one.

The test failed because the forbidden path completed without throwing. That's a
demonstrated violation, not a warning."

---

## 2:30 – 2:55 — After the repair

> **[Click: REPAIRED in the scenario selector]**

"Now the minimal repair — one guard added to `restoreOrder`: a refunded order
can't be restored.

NeverGraph re-runs the **same generated regression test**. Pass. Exit code zero.

And the bounded search: NEVER-005 **unreachable** again. The PAID state carrying
a historical refund can't be constructed anymore, so there's no path into the
forbidden state."

> **[Point: the three-state strip at the top]**

"Baseline unreachable. After the feature, reachable. After the repair,
unreachable — verified by the same executable proof."

---

## 2:55 – 3:10 — Close

> **[Screen: Overview, any scenario]**

"What makes this different is the ordering.

NeverGraph discovers the rule **before** it discovers the bug. The invariant was
recovered from evidence that predates the change — so finding the violation isn't
hindsight, it's an implicit constraint being checked for the first time.

Recover what your software has learned must never happen. Prove every new change
still can't make it happen."

---

## Accuracy notes for the presenter

Things to say — and not say — so the demo stays truthful:

- **Say** "unreachable in bounded exploration" if pressed. The bound is depth ≤ 10
  and ≤ 10,000 visited states, shown in the Proof tab. Do **not** say "formally
  verified" or "mathematically proven".
- **Say** "IBM Bob recovered the rules". Do **not** say Bob wrote the repair — the
  Bob budget was exhausted before that step and the one-guard repair was applied
  manually. The honest framing is "NeverGraph verified the repair", which is
  exactly what the dashboard shows.
- The dashboard is **read-only** over captured artifacts. If asked: the scenarios
  are real deterministic captures from the actual BFS engine and the actual
  Vitest runs, not mocked data. `scripts/capture-nevergraph-scenario.mjs`
  produced them.
- Mercury is a **synthetic** demo repository built to make this class of violation
  demonstrable. Don't imply it's a production codebase.

## Fallback if the dev server misbehaves

The dashboard is a static build. If `dev` is unstable mid-demo:

```bash
pnpm --filter @nevergraph/dashboard build
pnpm --filter @nevergraph/dashboard start
```

Scenarios are also directly addressable, which is useful for a scripted recording
or if the selector is missed:

```
http://localhost:3000/?scenario=baseline
http://localhost:3000/?scenario=changed
http://localhost:3000/?scenario=repaired
```

The **Play demo** button cycles baseline → changed → repaired automatically if
you would rather narrate hands-free.

## Timing summary

| Segment | Window | Content |
|---|---|---|
| Hook | 0:00–0:20 | The unwritten second specification |
| Recovery | 0:20–0:45 | Five rules recovered by IBM Bob |
| The rule | 0:45–1:10 | NEVER-005 + compiled condition + evidence |
| Baseline | 1:10–1:35 | Unreachable, context-aware nodes introduced |
| Regression | 1:35–2:05 | Feature added, FOUND, five-step witness |
| Proof | 2:05–2:30 | Generated test, REPRODUCED, exit 1 |
| Repair | 2:30–2:55 | Same test PASS, UNREACHABLE again |
| Close | 2:55–3:10 | Rule before bug; tagline |
