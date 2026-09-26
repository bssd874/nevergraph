/**
 * @nevergraph/schemas
 *
 * Shared Zod schemas and TypeScript types for the NeverGraph pipeline.
 * All packages import from this barrel — never from individual source files.
 *
 * Dependency order within this package:
 *   graph-state  →  transition, witness
 *   forbidden-condition  →  rule, graph
 *   rule  →  graph
 *   witness  →  proof
 */

// Primitive building blocks (no internal deps)
export {
  GraphStateSchema,
  GuardSignalSchema,
  type GraphState,
  type GuardSignal,
} from "./graph-state.js";

export {
  ForbiddenConditionSchema,
  type ForbiddenCondition,
} from "./forbidden-condition.js";

// Evidence
export {
  EvidenceTypeSchema,
  EvidenceItemSchema,
  type EvidenceType,
  type EvidenceItem,
} from "./evidence.js";

// Transitions (depend on graph-state)
export {
  StateTransitionSchema,
  type StateTransition,
} from "./transition.js";

// Rules (depend on forbidden-condition)
export {
  ConfidenceSchema,
  NeverRuleSchema,
  type Confidence,
  type NeverRule,
} from "./rule.js";

// Graph (depends on rule)
export {
  NeverGraphNodeSchema,
  NeverGraphEdgeSchema,
  ReachabilityStatusSchema,
  NeverGraphDataSchema,
  type NeverGraphNode,
  type NeverGraphEdge,
  type ReachabilityStatus,
  type NeverGraphData,
} from "./graph.js";

// Witness (depends on graph-state)
export {
  WitnessStepSchema,
  WitnessSchema,
  type WitnessStep,
  type Witness,
} from "./witness.js";

// Proof (depends on witness)
export {
  ProofStatusSchema,
  TestResultSchema,
  ProofReceiptSchema,
  type ProofStatus,
  type TestResult,
  type ProofReceipt,
} from "./proof.js";
