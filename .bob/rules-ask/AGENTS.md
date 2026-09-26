# AGENTS.md — Ask Mode Rules

This file provides guidance to agents when working with code in this repository.

## Documentation Context (Non-Obvious)

- **`docs/PRD.md` is the single source of truth** — it defines all FRs, demo scenarios, and out-of-scope items. Do not answer product questions from memory; read the PRD.
- **`nevergraph-plan.md` in the root** contains the implementation plan including data contracts, phase breakdown, risks, and the golden path checklist.
- **`demo/mercury/`** is NOT a real application — it is a synthetic demo designed so specific static analysis patterns yield the planted evidence. Reading it as a real codebase is misleading.
- **`.nevergraph/` files are outputs**, not configuration — they are written by the analyzer/Bob workflow and read by the dashboard. They do not configure system behavior.
- **"NEVER-003" is discovered, not hardcoded** — the PRD's anti-hardcoding requirement (§20) means the invariant text only appears in `.nevergraph/rules.json` after Bob runs synthesis; it is never hard-coded in analyzer or graph code.
- **The dashboard cannot trigger analysis** — analysis runs through Bob + MCP tools. The dashboard is a viewer.
- **`bob_sessions/` contains required hackathon evidence** — screenshots must be stored there per PRD §27.
