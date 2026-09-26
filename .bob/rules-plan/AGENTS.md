# AGENTS.md — Plan Mode Rules

This file provides guidance to agents when working with code in this repository.

## Architectural Constraints (Non-Obvious)

- **Package dependency order is a hard constraint**: `schemas` → `analyzer`/`graph`/`runner` → `mcp/server` → `apps/dashboard`. Circular imports between these will break pnpm workspace resolution.
- **BFS must use compound state nodes** — `(status, context_flags)` tuples. A plan that treats status strings as graph nodes will produce false negatives for NEVER-003 (refunded-then-restored path looks like normal `PAID→SHIPPED`).
- **Mercury transitions must follow one consistent syntactic pattern** — any plan to make Mercury more "realistic" by using varied patterns risks breaking the ts-morph extractor.
- **Bob invariant synthesis is the only non-deterministic step** — all other data flowing through the system (extraction, BFS, test execution) must be fully deterministic. Plans that add AI reasoning elsewhere violate this boundary.
- **Test generation is Mercury-specific for MVP** — a generic test generator requires knowing arbitrary repo import structures. Plans to generalize this are out of scope (PRD §26).
- **Dashboard reads three JSON snapshots** (baseline, changed, repaired) — not a live connection. Plans for real-time streaming, websockets, or SSE are P2 at earliest.
- **The golden path must work before any of these are planned**: animations, Proof Receipt UI, CLI, multi-repo support, Git diff automation, NEVER-001/002/004/005 evidence display.
- **MCP tool `run_witness` runs real Vitest** — it does not mock test execution. Plans that add a mock test runner would violate FR-013 ("test must fail against the buggy implementation").
- **Anti-hardcoding (PRD §20)**: the rule description "A refunded order must never become shipped" must not appear in any TypeScript source file except `.nevergraph/rules.json` (written by Bob). Plans must preserve this separation.
