#!/usr/bin/env node
/**
 * NeverGraph MCP Server — Phase 5
 *
 * Exposes deterministic NeverGraph tools over the Model Context Protocol.
 * All semantic reasoning is performed by IBM Bob using the NeverGraph skill.
 * This server provides only deterministic capabilities:
 *   - Repository scanning (analyzer)
 *   - Evidence/transition/rule retrieval (with Zod validation)
 *   - Counterexample search (graph BFS)
 *   - Witness execution (runner)
 *   - Rule verification (graph)
 *
 * The workspaceRoot defaults to the directory from which the server is
 * started (process.cwd()). Pass NEVERGRAPH_WORKSPACE env var to override.
 *
 * No AST parsing, BFS, test generation, or Vitest execution logic lives
 * in this file — all such work is delegated to the respective packages.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import path from "node:path";
import { scanRepository } from "./tools/scan_repository.js";
import { getRepositoryEvidence } from "./tools/get_repository_evidence.js";
import { getTransitions } from "./tools/get_transitions.js";
import { getNeverRules } from "./tools/get_never_rules.js";
import { findCounterexample } from "./tools/find_counterexample.js";
import { runWitness } from "./tools/run_witness.js";
import { verifyRule } from "./tools/verify_rule.js";
import { getRuleEvidence } from "./tools/get_rule_evidence.js";
import {
  readEvidence,
  runSynthesisPipeline,
} from "./persistence.js";

// ---------------------------------------------------------------------------
// Workspace root resolution
// ---------------------------------------------------------------------------

const workspaceRoot = process.env["NEVERGRAPH_WORKSPACE"]
  ? path.resolve(process.env["NEVERGRAPH_WORKSPACE"])
  : process.cwd();

// ---------------------------------------------------------------------------
// Server setup
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: "nevergraph",
  version: "0.1.0",
});

// ---------------------------------------------------------------------------
// Tool: scan_repository
// ---------------------------------------------------------------------------

server.registerTool(
  "scan_repository",
  {
    description:
      "Run the deterministic NeverGraph repository analyzer against a TypeScript " +
      "codebase. Extracts evidence items and state transitions. Writes " +
      "evidence.json and transitions.json to .nevergraph/. Call this first " +
      "before any synthesis or graph operations.",
    inputSchema: {
      repoPath: z
        .string()
        .describe(
          "Path to the TypeScript repository root. Absolute or relative to " +
          "the NeverGraph workspace root.",
        ),
    },
  },
  async ({ repoPath }) => {
    try {
      const result = scanRepository({ repoPath, workspaceRoot });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error: ${String(err)}` }],
        isError: true,
      };
    }
  },
);

// ---------------------------------------------------------------------------
// Tool: get_repository_evidence
// ---------------------------------------------------------------------------

server.registerTool(
  "get_repository_evidence",
  {
    description:
      "Return validated EvidenceItem[] from .nevergraph/evidence.json. " +
      "This is the primary input for Bob's negative invariant synthesis. " +
      "All items are Zod-validated before being returned.",
    inputSchema: {},
  },
  async () => {
    try {
      const output = getRepositoryEvidence({ workspaceRoot });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(output, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error: ${String(err)}` }],
        isError: true,
      };
    }
  },
);

// ---------------------------------------------------------------------------
// Tool: get_transitions
// ---------------------------------------------------------------------------

server.registerTool(
  "get_transitions",
  {
    description:
      "Return validated StateTransition[] from .nevergraph/transitions.json. " +
      "Transitions describe the state machine extracted from the repository. " +
      "All items are Zod-validated before being returned.",
    inputSchema: {},
  },
  async () => {
    try {
      const output = getTransitions({ workspaceRoot });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(output, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error: ${String(err)}` }],
        isError: true,
      };
    }
  },
);

// ---------------------------------------------------------------------------
// Tool: get_never_rules
// ---------------------------------------------------------------------------

server.registerTool(
  "get_never_rules",
  {
    description:
      "Return validated NeverRule[] from .nevergraph/rules.json. " +
      "These are the latent negative invariants previously synthesized by Bob " +
      "and persisted after Zod validation. Returns an empty array if no rules " +
      "have been synthesized yet.",
    inputSchema: {},
  },
  async () => {
    try {
      const output = getNeverRules({ workspaceRoot });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(output, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error: ${String(err)}` }],
        isError: true,
      };
    }
  },
);

// ---------------------------------------------------------------------------
// Tool: submit_synthesized_rules
// ---------------------------------------------------------------------------

server.registerTool(
  "submit_synthesized_rules",
  {
    description:
      "Accept Bob's synthesized NeverRule candidates, validate them with Zod, " +
      "check all evidence references against the real evidence set, apply the " +
      "deterministic confidence policy, assign stable IDs, and persist valid " +
      "rules to .nevergraph/rules.json. Invalid or hallucinated rules are " +
      "rejected before any write occurs. Returns the list of persisted rules " +
      "and any validation errors.",
    inputSchema: {
      candidates: z
        .string()
        .describe(
          "JSON string containing the array of candidate NeverRule objects " +
          "produced by Bob synthesis. Must be parseable as NeverRule[].",
        ),
    },
  },
  async ({ candidates }) => {
    try {
      const evidence = readEvidence(workspaceRoot);
      let parsed: unknown;

      try {
        parsed = JSON.parse(candidates);
      } catch {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: "candidates must be valid JSON",
                persisted: 0,
                rules: [],
                errors: [],
              }),
            },
          ],
          isError: true,
        };
      }

      const { rules, errors } = runSynthesisPipeline(parsed, evidence, workspaceRoot);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                persisted: rules.length,
                rules,
                validationErrors: errors,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error: ${String(err)}` }],
        isError: true,
      };
    }
  },
);

// ---------------------------------------------------------------------------
// Tool: find_counterexample
// ---------------------------------------------------------------------------

server.registerTool(
  "find_counterexample",
  {
    description:
      "Run deterministic BFS to determine if a ForbiddenCondition is reachable " +
      "from an initial GraphState given the current transitions. Delegates to " +
      "@nevergraph/graph — no reachability logic lives in this handler. " +
      "Bob MUST call this tool before claiming any violation exists.",
    inputSchema: {
      initialState: z
        .object({
          state: z.string(),
          facts: z.record(z.string(), z.union([z.boolean(), z.string(), z.number(), z.null()])),
        })
        .describe("Starting GraphState for the BFS search."),
      forbiddenCondition: z
        .object({
          targetState: z.string(),
          requiredFacts: z.record(
            z.string(),
            z.union([z.boolean(), z.string(), z.number(), z.null()]),
          ),
        })
        .describe("The condition that must never be satisfied."),
      limits: z
        .object({
          maxDepth: z.number().int().positive().optional(),
          maxVisitedStates: z.number().int().positive().optional(),
        })
        .optional()
        .describe("Optional BFS search limits. Defaults: maxDepth=10, maxVisitedStates=10000."),
    },
  },
  async ({ initialState, forbiddenCondition, limits }) => {
    try {
      const transitions = getTransitions({ workspaceRoot }).transitions;
      const ceInput = { initialState, transitions, forbiddenCondition };
      if (limits !== undefined) Object.assign(ceInput, { limits });
      const result = findCounterexample(ceInput as Parameters<typeof findCounterexample>[0]);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error: ${String(err)}` }],
        isError: true,
      };
    }
  },
);

// ---------------------------------------------------------------------------
// Tool: run_witness
// ---------------------------------------------------------------------------

server.registerTool(
  "run_witness",
  {
    description:
      "Execute a previously generated Vitest regression test file and return " +
      "the ProofExecutionResult. Delegates to @nevergraph/runner — no Vitest " +
      "logic lives in this handler. " +
      "status='reproduced' means the violation is executable. " +
      "status='not_reproduced' means the rule is safe (after repair). " +
      "status='execution_error' means infrastructure failure — do NOT repair.",
    inputSchema: {
      identifier: z.string().describe("Rule ID matching the witness, e.g. 'NEVER-001'."),
      cwd: z.string().describe("Working directory for vitest execution."),
      testFile: z
        .string()
        .describe("Path to the generated test file, relative to cwd or absolute within cwd."),
      configFile: z
        .string()
        .optional()
        .describe("Optional vitest config path relative to cwd."),
      timeoutMs: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Execution timeout in milliseconds. Default: 30000."),
    },
  },
  async ({ identifier, cwd, testFile, configFile, timeoutMs }) => {
    try {
      const input: Parameters<typeof runWitness>[0] = { identifier, cwd, testFile };
      if (configFile !== undefined) input.configFile = configFile;
      if (timeoutMs !== undefined) input.timeoutMs = timeoutMs;
      const result = await runWitness(input);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error: ${String(err)}` }],
        isError: true,
      };
    }
  },
);

// ---------------------------------------------------------------------------
// Tool: verify_rule
// ---------------------------------------------------------------------------

server.registerTool(
  "verify_rule",
  {
    description:
      "Run deterministic graph-level reachability verification for a specific " +
      "NeverRule ID. Reads the rule from rules.json and the transitions from " +
      "transitions.json, then delegates to @nevergraph/graph. Returns explicit " +
      "errors rather than fabricating results when context is missing.",
    inputSchema: {
      ruleId: z.string().describe("The NeverRule ID to verify, e.g. 'NEVER-001'."),
      initialState: z
        .object({
          state: z.string(),
          facts: z.record(z.string(), z.union([z.boolean(), z.string(), z.number(), z.null()])),
        })
        .describe("Starting GraphState for the reachability check."),
      limits: z
        .object({
          maxDepth: z.number().int().positive().optional(),
          maxVisitedStates: z.number().int().positive().optional(),
        })
        .optional(),
    },
  },
  async ({ ruleId, initialState, limits }) => {
    try {
      const vrInput: Parameters<typeof verifyRule>[0] = { ruleId, initialState, workspaceRoot };
      if (limits !== undefined) {
        const lim: { maxDepth?: number; maxVisitedStates?: number } = {};
        if (limits.maxDepth !== undefined) lim.maxDepth = limits.maxDepth;
        if (limits.maxVisitedStates !== undefined) lim.maxVisitedStates = limits.maxVisitedStates;
        vrInput.limits = lim;
      }
      const result = verifyRule(vrInput);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error: ${String(err)}` }],
        isError: true,
      };
    }
  },
);

// ---------------------------------------------------------------------------
// Tool: get_rule_evidence (optional)
// ---------------------------------------------------------------------------

server.registerTool(
  "get_rule_evidence",
  {
    description:
      "Return the actual EvidenceItem objects referenced by a specific NeverRule. " +
      "Useful for Bob to inspect supporting evidence for a synthesized rule.",
    inputSchema: {
      ruleId: z.string().describe("The NeverRule ID, e.g. 'NEVER-001'."),
    },
  },
  async ({ ruleId }) => {
    try {
      const result = getRuleEvidence({ ruleId, workspaceRoot });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error: ${String(err)}` }],
        isError: true,
      };
    }
  },
);

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

const transport = new StdioServerTransport();
await server.connect(transport);
