# IBM Bob Session Evidence — NeverGraph Phase 5

**Project:** NeverGraph
**Hackathon:** IBM Bob 2.0 Hackathon 2026
**Session Type:** IBM Bob — Agent Mode (semantic synthesis + MCP integration)
**Evidence ID:** `04_invariant_synthesis_mcp`
**Landed as commit:** `522b877` — *feat: add Bob invariant synthesis and NeverGraph MCP*
**Purpose:** Recover the latent negative invariants from analyzer evidence, and expose the deterministic pipeline to Bob through MCP.

---

## 1. Session Goal

This is the session where NeverGraph's central claim had to actually hold: that a
latent negative specification can be **recovered from repository evidence** rather
than written by hand.

Bob was asked to:

- read the structured evidence produced by the Phase 2 analyzer;
- synthesize candidate `NeverRule` objects grounded in that evidence;
- justify each rule by citing specific evidence ids;
- apply the confidence policy defined in the NeverGraph skill;
- build the MCP server that exposes the deterministic packages as tools;
- author the Bob Skill that constrains all future reasoning.

Critically, Bob was **not** told which rules to find, and was not given the
golden demo rule.

---

## 2. The Anti-Hardcoding Constraint

The whole project is worthless if the rules are hardcoded. The constraint carried
into this session from planning was absolute:

> No `NEVER-XXX` description, forbidden condition, or rule identity may exist
> anywhere in the analyzed source, the analyzer, or the graph engine.

This is verifiable in the repository today. The string `NEVER-005` does not appear
anywhere in the analyzed source (`demo/mercury/src/`), the analyzer
(`packages/analyzer/src/`), or the graph engine (`packages/graph/src/`).

Across the whole tracked repository it appears only in downstream artifacts and
documentation:

- `.nevergraph/rules.json` — the persisted output of this synthesis session,
- `.nevergraph/scenarios/*.json` — captured search results,
- `demo/mercury/tests/regression/NEVER-005.spec.ts` — an auto-generated file,
- `apps/dashboard/src/data/__tests__/artifacts.test.ts` — assertions *against*
  the recovered artifacts,
- `docs/PRD.md` — the product requirements document.

None of these is an input to synthesis or to reachability.

---

## 3. Input: Real Analyzer Evidence

Bob reasoned over `.nevergraph/evidence.json`, which at this point contained
**33 evidence items** extracted deterministically by ts-morph from `demo/mercury`.

Evidence categories available:

```text
negative_test   expect(() => fn(order)).toThrow()
guard           if (order.status !== X) throw ...
throw           throw new InvalidOrderTransitionError(...)
state_transition  order.status = OrderStatus.X
comment         terminal-intent comments above guards
constraint      fields preserved across transitions
```

Nothing in this corpus states an invariant. Each item is a syntactic fact.

---

## 4. Output: Five Recovered Never Rules

Bob synthesized five candidate invariants. All five survived validation and were
persisted to `.nevergraph/rules.json`:

| Rule | Description | Confidence | Evidence |
|---|---|---|---|
| NEVER-001 | A shipped order must never be cancelled | high | ev-008, ev-021, ev-022 |
| NEVER-002 | An order that has already been paid must never be paid again | medium | ev-004, ev-015, ev-016 |
| NEVER-003 | A refunded order must never be paid again | medium | ev-001, ev-015, ev-016 |
| NEVER-004 | A cancelled order must never be shipped | high | ev-012, ev-026, ev-027 |
| NEVER-005 | A refunded order must never be shipped | high | ev-013, ev-026, ev-027 |

Each is compiled into a machine-evaluable `ForbiddenCondition`. NEVER-005:

```json
{ "targetState": "SHIPPED", "requiredFacts": { "refundedAt": true } }
```

The candidate set as Bob produced it — before id assignment — is preserved
verbatim in [`synthesis.mjs`](../synthesis.mjs), which replays the synthesis
pipeline against the real evidence file.

### Why NEVER-005 is the golden rule

NEVER-005 was not selected because it was the most interesting-sounding. It was
selected later, in Phase 6, because it is the only recovered rule whose forbidden
condition depends on a **historical fact that survives a status change**
(`refundedAt`), which is precisely the condition a status-only graph cannot see.

Bob recovered it from evidence in this session without knowing it would become
the demo centerpiece.

---

## 5. Confidence Policy Applied, Not Asserted

The skill's confidence rule was enforced mechanically rather than trusted:

```text
1 independent signal category   → LOW     (flag for more evidence)
2 independent signal categories → MEDIUM  (maximum)
3+ independent categories       → HIGH    (allowed)
```

`validateSynthesizedRules()` in `mcp/server/src/persistence.ts` re-derives the
signal categories from the cited evidence and **caps** the confidence Bob claimed.
A rule claiming `high` on two categories is downgraded, not rejected.

This is why NEVER-002 and NEVER-003 sit at `medium`: their evidence resolves to
fewer independent categories than the `high` rules.

---

## 6. Validation Gate

No rule reaches the graph engine on Bob's say-so. `runSynthesisPipeline()`
applies, in order:

1. **Zod validation** against `NeverRuleSchema` from `packages/schemas`;
2. **evidence-reference resolution** — every cited `evidenceId` must exist in
   `evidence.json`, with matching file and line;
3. **confidence capping** from the recomputed signal categories;
4. **deterministic id assignment** — `NEVER-XXX` placeholders become stable ids;
5. **persistence** to `.nevergraph/rules.json`.

This gate is re-runnable today:

```bash
node validate-rules.mjs
```

```text
PASS: rules.json is valid -- 5 rules pass NeverRuleSchema, evidence-reference
validation, confidence policy, and deterministic ID validation
```

---

## 7. The Bob Skill

[`.bob/skills/nevergraph/SKILL.md`](../.bob/skills/nevergraph/SKILL.md) (342 lines)
was authored in this session to constrain the reasoning layer permanently. Its
non-negotiable principles:

1. **Evidence before invariant** — no rule from general best practice alone.
2. **Multiple independent signals** — confidence is earned, not claimed.
3. **No execution claims from reasoning alone** — Bob may never assert a state is
   reachable or unreachable from natural language. Only `find_counterexample`
   decides that.
4. **Candidate vs confirmed** — precise vocabulary separating a synthesized
   candidate, a graph-confirmed violation, and an executable proof.
5. **Minimal repair** — smallest possible change, no refactoring.

Principle 3 is the one that makes the product honest: it is what stops the
demonstration from being an LLM asserting a bug.

---

## 8. MCP Integration

`mcp/server/` was built in this session to expose the deterministic packages to
Bob as tools. Nine tools registered in `mcp/server/src/index.ts`:

| Tool | Backed by |
|---|---|
| `scan_repository` | `packages/analyzer` |
| `get_repository_evidence` | `.nevergraph/evidence.json` |
| `get_transitions` | `.nevergraph/transitions.json` |
| `get_never_rules` | `.nevergraph/rules.json` |
| `get_rule_evidence` | rule → evidence resolution |
| `submit_synthesized_rules` | the validation gate in §6 |
| `find_counterexample` | `packages/graph` bounded BFS |
| `run_witness` | `packages/runner` generation + execution |
| `verify_rule` | re-verification after a change |

Every tool is a **thin wrapper**. None implements logic of its own — that
boundary is what keeps reachability deterministic regardless of what Bob reasons.

Configuration: [`.bob/mcp.json`](../.bob/mcp.json).

---

## 9. Test Coverage Added

```text
mcp/server/src/__tests__/persistence.test.ts   validation gate, confidence
                                                capping, id assignment
mcp/server/src/__tests__/tools.test.ts         tool contracts and wrapper
                                                behavior
```

49 tests across the two files, all passing.

---

## 10. Why This Bob Session Matters

This session is the one that distinguishes NeverGraph from a regression-test
generator.

A test generator starts from a known failure. NeverGraph starts from evidence
that predates any failure, and asks Bob a question that has no lookup answer:
*what has this repository implicitly learned must never happen?*

The five rules in `.nevergraph/rules.json` are the answer. They were recovered,
validated, and persisted before any bug existed to find — which is what makes the
Phase 6 violation a genuine discovery rather than hindsight.

---

## 11. Session Outcome

- 5 latent negative invariants recovered from 33 evidence items;
- all 5 passed Zod validation, evidence resolution and confidence policy;
- Bob Skill authored and committed;
- MCP server with 9 deterministic tools built and tested;
- anti-hardcoding constraint verified — no rule identity in analyzed source.

---

## 12. Evidence Notes for Submission

The reasoning, decisions and artifacts of this session are preserved in the
repository itself:

```text
.nevergraph/rules.json              the recovered rules
synthesis.mjs                       replayable synthesis against real evidence
validate-rules.mjs                  re-runnable validation gate
.bob/skills/nevergraph/SKILL.md     the reasoning constraints
mcp/server/                         the tool surface
```

If an IBM Bob task/session screenshot is available for this session, store it as:

```text
bob_sessions/04_invariant_synthesis_mcp.png
```

No screenshot is currently committed for this session; the artifacts above are
the primary evidence.
