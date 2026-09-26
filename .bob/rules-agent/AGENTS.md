# AGENTS.md — Agent Mode Rules

This file provides guidance to agents when working with code in this repository.

## Coding Rules (Non-Obvious)

- **`packages/schemas` must be built before any other package** — all workspace packages import from it via `workspace:*` protocol; TypeScript will fail to resolve types if schemas is not compiled first.
- **Mercury source patterns are intentional constraints** — ts-morph extractors target exact syntactic patterns. Do not "improve" Mercury code style if it changes these patterns.
- **BFS graph nodes carry context flags** — `{ status: OrderStatus, paidAt: boolean, refundedAt: boolean, cancelledAt: boolean }`. The graph engine cannot correctly detect NEVER-003 without the `refundedAt` flag in the node key.
- **MCP tools write to `.nevergraph/` directly** — they do not return all data through the MCP response. Bob reads back files via `get_*` tools. Do not buffer large evidence arrays in memory across tool calls.
- **Test generator uses Mercury-specific import paths** — the action-to-import map lives in `packages/runner/src/templates/mercury.witness.ts.hbs` (or equivalent config). Update this map if Mercury service file paths change.
- **`ProofReceipt.status: "error"` vs `"fail"`** — infrastructure crash (bad imports, missing file) must be `"error"`, not `"fail"`. Bob must not attempt repair when status is `"error"`.
- **Bob repair instruction is in the skill, not the MCP tool** — the MCP `run_witness` tool just executes and returns. The Bob skill prompt instructs Bob to repair only after `status: "reproduced"` is confirmed.
- **Scenario switching is JSON-snapshot based** — maintain three separate analysis snapshots: `analysis.baseline.json`, `analysis.changed.json`, `analysis.repaired.json`. Dashboard reads via `?scenario=` param.
- **pnpm filter names match `package.json#name`** — use `@nevergraph/schemas`, `@nevergraph/analyzer`, etc. If a filter command fails, check the `name` field in the package's `package.json`.
- **Vitest in Mercury runs from `demo/mercury/` directory** — the executor spawns the subprocess with `cwd: path.resolve("demo/mercury")` to get correct relative imports.
