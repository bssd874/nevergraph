# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Project

NeverGraph — a TypeScript monorepo (pnpm workspaces) that discovers negative invariants from a demo repo (Mercury), builds a state graph, and proves violations. See `docs/PRD.md` for the full product spec and `nevergraph-plan.md` for the implementation plan.

## Workspace Layout

```
apps/dashboard/       Next.js dashboard (reads .nevergraph/ JSON; never triggers analysis)
packages/schemas/     Shared Zod schemas — no dependencies; build this first
packages/analyzer/    ts-morph static analysis → evidence.json + transitions.json
packages/graph/       Custom BFS graph engine → witness extraction
packages/runner/      Witness → Vitest file generator + executor
mcp/server/           MCP server wrapping all deterministic packages
demo/mercury/         Synthetic demo repo that is the analysis TARGET
.nevergraph/          Local JSON persistence (evidence, transitions, rules, proofs)
.bob/                 Bob skill + MCP config
bob_sessions/         Screenshots of Bob task sessions (hackathon evidence)
```

## Commands

```bash
pnpm install                          # install all workspace packages
pnpm -r build                         # build all packages in dependency order
pnpm -r test                          # run all vitest suites
pnpm --filter @nevergraph/schemas test
pnpm --filter @nevergraph/analyzer test
pnpm --filter @nevergraph/graph test
pnpm --filter @nevergraph/runner test
pnpm --filter mercury test            # run Mercury demo tests
pnpm --filter mercury test -- --reporter=verbose tests/order.spec.ts  # single file
```

## Critical Architecture Rules

- **schemas package has zero dependencies** — every other package imports from it; build schemas first.
- **Dashboard is read-only** — it reads `.nevergraph/*.json`; it does NOT call the analyzer or MCP.
- **MCP tools are thin wrappers** — they call into `packages/*` and never implement logic themselves.
- **Bob does reasoning; packages do computation** — BFS, extraction, test execution are all deterministic code. Bob synthesizes invariants and proposes repairs.
- **All Bob-generated structures must pass Zod validation** before being consumed by the graph engine.
- **Context-flag BFS** — graph nodes are `(status, {paidAt,refundedAt,cancelledAt})` tuples, not just status strings. Required to detect NEVER-003 correctly.

## Mercury Conventions (demo repo)

- All state assignments follow exactly: `order.status = OrderStatus.XXX` — ts-morph extracts these by this pattern.
- All guards follow exactly: `if (order.refundedAt) throw new InvalidStateTransition(...)` — extractor looks for this.
- Negative tests follow exactly: `expect(() => fn(order)).toThrow()` — test extractor looks for this.
- Terminal comments sit directly above guard code: `// Refunded orders are terminal` on the line before the throw.
- **Do not deviate from these patterns** or the analyzer will miss evidence.

## Golden Path First

- Do not implement optional features (animations, Proof Receipt UI, CLI, multiple domains) until the 13-step golden path in `nevergraph-plan.md` Phase 6 works end-to-end.
- The demo script (PRD §30) uses `?scenario=baseline|changed|repaired` query params to switch dashboard views.

## Testing

- Test framework: **Vitest** everywhere (including Mercury demo).
- Analyzer and graph tests use **fixture strings** (not real Mercury) for unit tests; integration tests use real Mercury.
- Generated regression tests are written to `demo/mercury/tests/regression/NEVER-{id}.spec.ts`.
- Do not add tests for scenarios that cannot happen in Mercury's controlled domain.

## Zod Schema Contracts

All data flowing between packages must match schemas in `packages/schemas/src/`. Never pass raw unvalidated objects from one package to another. See `nevergraph-plan.md` Section 2 for the exact interface definitions.
