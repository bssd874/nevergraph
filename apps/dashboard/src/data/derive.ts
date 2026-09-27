/**
 * Pure derivations over validated NeverGraph artifacts.
 *
 * Nothing in this module invents data. Every returned value is either read
 * straight from a snapshot or computed from snapshot contents (set unions,
 * graph layering, path matching, transition diffs).
 */
import type {
  EvidenceItem,
  ForbiddenCondition,
  GraphState,
  GuardSignal,
  NeverRule,
  StateTransition,
  Witness,
} from "@nevergraph/schemas";
import type {
  ProofSummary,
  ScenarioSnapshot,
  SearchStatus,
  SnapshotGraphEdge,
  SnapshotGraphNode,
} from "./snapshot-schema";

export type FactValue = boolean | string | number | null;

/* ------------------------------------------------------------------ states */

/** Structural equality over a context-aware graph state (status + fact map). */
export function statesEqual(left: GraphState, right: GraphState): boolean {
  if (left.state !== right.state) return false;
  const leftKeys = Object.keys(left.facts);
  const rightKeys = Object.keys(right.facts);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key) => key in right.facts && left.facts[key] === right.facts[key]);
}

/** Resolves a concrete graph state to its snapshot node id, or null. */
export function findNodeId(nodes: SnapshotGraphNode[], state: GraphState): string | null {
  const match = nodes.find((node) => statesEqual(node.graphState, state));
  return match ? match.id : null;
}

/**
 * Every fact key that matters for this scenario: the union of keys observed on
 * graph nodes plus every key named by the selected rule's forbidden condition.
 * Including the condition keys guarantees a fact the rule depends on is never
 * hidden, even if no explored node happened to carry it.
 */
export function scenarioFactKeys(snapshot: ScenarioSnapshot): string[] {
  const keys = new Set<string>();
  for (const node of snapshot.graph.nodes) {
    for (const key of Object.keys(node.graphState.facts)) keys.add(key);
  }
  for (const key of Object.keys(snapshot.selectedRule.forbiddenCondition.requiredFacts)) {
    keys.add(key);
  }
  return [...keys].sort();
}

/** True when the state satisfies the forbidden condition (state + all required facts). */
export function satisfiesCondition(state: GraphState, condition: ForbiddenCondition): boolean {
  if (state.state !== condition.targetState) return false;
  return Object.entries(condition.requiredFacts).every(
    ([key, value]) => key in state.facts && state.facts[key] === value,
  );
}

/* ------------------------------------------------------------------- edges */

export interface MergedEdge {
  /** Display id — the first contributing snapshot edge id. */
  id: string;
  source: string;
  target: string;
  action: string;
  /** All snapshot edge ids collapsed into this display edge. */
  sourceEdgeIds: string[];
}

/**
 * Collapses parallel snapshot edges that share (source, target, action).
 * The engine emits one edge per contributing transition definition; those are
 * indistinguishable on screen, so they are merged for rendering while keeping
 * every original id for traceability.
 */
export function mergeParallelEdges(edges: SnapshotGraphEdge[]): MergedEdge[] {
  const byKey = new Map<string, MergedEdge>();
  for (const edge of edges) {
    const key = edgeKey(edge.source, edge.target, edge.action);
    const existing = byKey.get(key);
    if (existing) {
      existing.sourceEdgeIds.push(edge.id);
      continue;
    }
    byKey.set(key, {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      action: edge.action,
      sourceEdgeIds: [edge.id],
    });
  }
  return [...byKey.values()];
}

/* ----------------------------------------------------------------- witness */

export interface WitnessHighlight {
  /** Ordered node ids along the counterexample, entry state first. */
  nodeIds: string[];
  /** Node ids as a set, for O(1) lookup during rendering. */
  nodeIdSet: Set<string>;
  /** Display-edge keys traversed by the witness. */
  edgeKeys: Set<string>;
  /** Final node id — the forbidden state — or null when unresolved. */
  forbiddenNodeId: string | null;
  /** 0-based position along the path per node id, for ordinals in the UI. */
  stepIndexByNodeId: Map<string, number>;
}

export const EMPTY_HIGHLIGHT: WitnessHighlight = {
  nodeIds: [],
  nodeIdSet: new Set(),
  edgeKeys: new Set(),
  forbiddenNodeId: null,
  stepIndexByNodeId: new Map(),
};

export function edgeKey(source: string, target: string, action: string): string {
  return `${source}\u0000${target}\u0000${action}`;
}

/**
 * Maps a witness onto snapshot node/edge identities so the graph can highlight
 * it. States are matched structurally rather than by re-serialising node ids.
 */
export function deriveWitnessHighlight(
  witness: Witness | null,
  nodes: SnapshotGraphNode[],
): WitnessHighlight {
  if (!witness || witness.steps.length === 0) return EMPTY_HIGHLIGHT;

  const first = witness.steps[0];
  const firstId = findNodeId(nodes, first.fromState);
  if (!firstId) return EMPTY_HIGHLIGHT;

  const nodeIds: string[] = [firstId];
  const edgeKeys = new Set<string>();
  const stepIndexByNodeId = new Map<string, number>([[firstId, 0]]);

  for (const [index, step] of witness.steps.entries()) {
    const fromId = findNodeId(nodes, step.fromState);
    const toId = findNodeId(nodes, step.toState);
    if (!fromId || !toId) return EMPTY_HIGHLIGHT;
    edgeKeys.add(edgeKey(fromId, toId, step.action));
    nodeIds.push(toId);
    stepIndexByNodeId.set(toId, index + 1);
  }

  return {
    nodeIds,
    nodeIdSet: new Set(nodeIds),
    edgeKeys,
    forbiddenNodeId: nodeIds[nodeIds.length - 1] ?? null,
    stepIndexByNodeId,
  };
}

/**
 * The witness to highlight as a *live* violation. Gated on the bounded search
 * actually reporting "found", so the archived witness carried by the repaired
 * snapshot is never presented as a current counterexample.
 */
export function liveWitness(snapshot: ScenarioSnapshot): Witness | null {
  return snapshot.search.status === "found" ? snapshot.witness : null;
}

export interface WitnessStepView {
  /** 1-based position in the counterexample. */
  ordinal: number;
  action: string;
  fromState: GraphState;
  toState: GraphState;
  /** Fact keys newly set by this step. */
  factsIntroduced: string[];
  /** Transition definition backing this step, when the search path exposes it. */
  transition: StateTransition | null;
}

/** Zips witness steps with the search path's transition definitions. */
export function witnessStepViews(snapshot: ScenarioSnapshot): WitnessStepView[] {
  const witness = snapshot.witness;
  if (!witness) return [];

  return witness.steps.map((step, index) => {
    const before = new Set(Object.keys(step.fromState.facts));
    const candidate = snapshot.search.path[index];
    return {
      ordinal: index + 1,
      action: step.action,
      fromState: step.fromState,
      toState: step.toState,
      factsIntroduced: Object.keys(step.toState.facts).filter((key) => !before.has(key)),
      transition: candidate && candidate.action === step.action ? candidate : null,
    };
  });
}

/**
 * Whether a scenario's transition table still admits this step: some extracted
 * transition must share the action and source status, and every fact
 * precondition it declares must hold on the step's source state.
 *
 * This is how the repaired scenario can say *where* a replayed historical
 * counterexample now breaks, instead of asserting it without evidence.
 */
export function stepIsAdmissible(snapshot: ScenarioSnapshot, step: WitnessStepView): boolean {
  return snapshot.transitions.some((transition) => {
    if (transition.action !== step.action) return false;
    if (transition.from.state !== step.fromState.state) return false;
    return Object.entries(transition.from.facts).every(
      ([field, required]) => (step.fromState.facts[field] ?? null) === required,
    );
  });
}

/**
 * Index of the first witness step this scenario's transition table no longer
 * admits, or null when the whole sequence is still takeable.
 */
export function firstBlockedStepIndex(snapshot: ScenarioSnapshot): number | null {
  const steps = witnessStepViews(snapshot);
  const index = steps.findIndex((step) => !stepIsAdmissible(snapshot, step));
  return index === -1 ? null : index;
}

/* ------------------------------------------------------------------ layout */

export interface PositionedNode {
  node: SnapshotGraphNode;
  /** BFS distance from the initial state. */
  layer: number;
  x: number;
  y: number;
}

export interface GraphLayout {
  nodes: PositionedNode[];
  edges: MergedEdge[];
  nodeWidth: number;
  nodeHeight: number;
  layerCount: number;
}

export interface LayoutOptions {
  nodeWidth?: number;
  nodeHeight?: number;
  columnGap?: number;
  rowGap?: number;
}

/**
 * Deterministic left-to-right layered layout: column = BFS distance from the
 * initial state, row = stable order within the layer. Deterministic layout
 * matters for a recorded demo — the same scenario always looks identical.
 */
export function layoutGraph(snapshot: ScenarioSnapshot, options: LayoutOptions = {}): GraphLayout {
  const factRows = scenarioFactKeys(snapshot).length;
  const nodeWidth = options.nodeWidth ?? 212;
  const nodeHeight = options.nodeHeight ?? 56 + factRows * 22;
  const columnGap = options.columnGap ?? 84;
  const rowGap = options.rowGap ?? 40;

  const edges = mergeParallelEdges(snapshot.graph.edges);
  const nodesById = new Map(snapshot.graph.nodes.map((node) => [node.id, node]));

  const outgoing = new Map<string, string[]>();
  for (const edge of edges) {
    const list = outgoing.get(edge.source);
    if (list) list.push(edge.target);
    else outgoing.set(edge.source, [edge.target]);
  }

  const layerById = new Map<string, number>();
  const rootId = findNodeId(snapshot.graph.nodes, snapshot.initialState);
  const queue: string[] = [];
  if (rootId) {
    layerById.set(rootId, 0);
    queue.push(rootId);
  }

  while (queue.length > 0) {
    const current = queue.shift() as string;
    const currentLayer = layerById.get(current) ?? 0;
    for (const next of outgoing.get(current) ?? []) {
      if (layerById.has(next)) continue;
      layerById.set(next, currentLayer + 1);
      queue.push(next);
    }
  }

  // A node the traversal could not reach is parked in a trailing column rather
  // than silently dropped.
  const maxLayer = layerById.size > 0 ? Math.max(...layerById.values()) : 0;
  for (const node of snapshot.graph.nodes) {
    if (!layerById.has(node.id)) layerById.set(node.id, maxLayer + 1);
  }

  const byLayer = new Map<number, string[]>();
  for (const node of snapshot.graph.nodes) {
    const layer = layerById.get(node.id) ?? 0;
    const bucket = byLayer.get(layer);
    if (bucket) bucket.push(node.id);
    else byLayer.set(layer, [node.id]);
  }

  const nodes: PositionedNode[] = [];
  for (const [layer, ids] of [...byLayer.entries()].sort((a, b) => a[0] - b[0])) {
    ids.forEach((id, index) => {
      const node = nodesById.get(id);
      if (!node) return;
      nodes.push({
        node,
        layer,
        x: layer * (nodeWidth + columnGap),
        y: (index - (ids.length - 1) / 2) * (nodeHeight + rowGap),
      });
    });
  }

  return { nodes, edges, nodeWidth, nodeHeight, layerCount: byLayer.size };
}

/* ---------------------------------------------------------------- verdicts */

export type Tone = "ok" | "bad" | "warn" | "neutral";

export interface ScenarioVerdict {
  searchStatus: SearchStatus;
  /** Uppercase badge text for the reachability result. */
  searchLabel: string;
  searchTone: Tone;
  /** Headline claim about the negative specification. */
  headline: string;
  /** One-line, non-overstated explanation of what the search established. */
  detail: string;
  proof: ProofSummary | null;
  proofLabel: string | null;
  proofTone: Tone;
  /** True only for a live, currently reachable forbidden state. */
  isRegression: boolean;
}

export function scenarioVerdict(snapshot: ScenarioSnapshot): ScenarioVerdict {
  const { search, proof, selectedRule } = snapshot;
  const bound = `depth ≤ ${search.limits.maxDepth}`;

  const searchLabel =
    search.status === "found"
      ? "FOUND"
      : search.status === "unreachable"
        ? "UNREACHABLE"
        : "LIMIT_REACHED";

  const searchTone: Tone =
    search.status === "found" ? "bad" : search.status === "unreachable" ? "ok" : "warn";

  const headline =
    search.status === "found"
      ? "NEGATIVE SPECIFICATION REGRESSION"
      : search.status === "unreachable"
        ? "NEGATIVE SPECIFICATION PRESERVED"
        : "NEGATIVE SPECIFICATION INCONCLUSIVE";

  const detail =
    search.status === "found"
      ? `${selectedRule.id} became reachable in ${search.depth ?? search.path.length} transitions`
      : search.status === "unreachable"
        ? `Unreachable in bounded behavioral exploration — ${bound}, ${search.exploredStateCount} states explored`
        : `Exploration stopped at its bound (${bound}) — reachability is inconclusive`;

  const proofLabel =
    proof === null
      ? null
      : proof.status === "reproduced"
        ? "REPRODUCED"
        : proof.status === "not_reproduced"
          ? "NOT_REPRODUCED"
          : "EXECUTION_ERROR";

  const proofTone: Tone =
    proof === null
      ? "neutral"
      : proof.status === "reproduced"
        ? "bad"
        : proof.status === "not_reproduced"
          ? "ok"
          : "warn";

  return {
    searchStatus: search.status,
    searchLabel,
    searchTone,
    headline,
    detail,
    proof,
    proofLabel,
    proofTone,
    isRegression: search.status === "found",
  };
}

/* ------------------------------------------------------- transition diffing */

/** Stable identity for a transition across scenarios: action + endpoints. */
export function transitionKey(transition: StateTransition): string {
  return `${transition.action}\u0000${transition.from.state}\u0000${transition.to.state}`;
}

export function formatFactValue(value: FactValue): string {
  return value === null ? "null" : String(value);
}

/** The bare comparison a guard tests, with no claim about what it means. */
export function formatGuardCondition(guard: GuardSignal): string {
  switch (guard.operator) {
    case "eq":
      return `${guard.field} = ${formatFactValue(guard.value)}`;
    case "neq":
      return `${guard.field} ≠ ${formatFactValue(guard.value)}`;
    case "truthy":
      return `${guard.field} is set`;
    case "falsy":
      return `${guard.field} is not set`;
  }
}

/**
 * A GuardSignal is a *rejection* condition: the analyzer only extracts guards
 * whose if-body throws (`if (order.refundedAt !== null) throw ...`). Rendering
 * the bare comparison would read as a requirement — the exact opposite of what
 * the code does — so guards are always shown as the condition that throws.
 */
export function formatGuard(guard: GuardSignal): string {
  return `throw if ${formatGuardCondition(guard)}`;
}

export interface ModifiedTransition {
  before: StateTransition;
  after: StateTransition;
  addedGuards: GuardSignal[];
  removedGuards: GuardSignal[];
  /** Fact preconditions newly required on the source state. */
  addedFactPreconditions: [string, FactValue][];
}

export interface TransitionDiff {
  added: StateTransition[];
  removed: StateTransition[];
  modified: ModifiedTransition[];
}

/** Compares two scenarios' transition tables, keyed by action + endpoints. */
export function diffTransitions(
  before: StateTransition[],
  after: StateTransition[],
): TransitionDiff {
  const beforeByKey = new Map(before.map((item) => [transitionKey(item), item]));
  const afterByKey = new Map(after.map((item) => [transitionKey(item), item]));
  const diff: TransitionDiff = { added: [], removed: [], modified: [] };

  for (const [key, afterItem] of afterByKey) {
    const beforeItem = beforeByKey.get(key);
    if (!beforeItem) {
      diff.added.push(afterItem);
      continue;
    }

    const beforeGuards = new Set(beforeItem.guards.map(formatGuard));
    const afterGuards = new Set(afterItem.guards.map(formatGuard));
    const addedGuards = afterItem.guards.filter((guard) => !beforeGuards.has(formatGuard(guard)));
    const removedGuards = beforeItem.guards.filter((guard) => !afterGuards.has(formatGuard(guard)));
    const addedFactPreconditions = Object.entries(afterItem.from.facts).filter(
      ([factKey, value]) => beforeItem.from.facts[factKey] !== value,
    ) as [string, FactValue][];

    if (addedGuards.length > 0 || removedGuards.length > 0 || addedFactPreconditions.length > 0) {
      diff.modified.push({
        before: beforeItem,
        after: afterItem,
        addedGuards,
        removedGuards,
        addedFactPreconditions,
      });
    }
  }

  for (const [key, beforeItem] of beforeByKey) {
    if (!afterByKey.has(key)) diff.removed.push(beforeItem);
  }

  return diff;
}

export interface FactConstraint {
  field: string;
  text: string;
  /**
   * "precondition" — the source state must carry this fact value for the
   * transition to be taken (this is what the graph engine evaluates).
   * "guard" — a throwing check extracted from the function body.
   */
  origin: "precondition" | "guard";
}

export interface FactGate {
  transition: StateTransition;
  constraints: FactConstraint[];
}

/**
 * Transitions whose source state or guards constrain a fact key the selected
 * rule depends on. This is what makes the repair legible: after the fix, the
 * restore transition can only fire when the rule's trigger fact is absent.
 */
export function factGatedTransitions(snapshot: ScenarioSnapshot): FactGate[] {
  const ruleFactKeys = new Set(
    Object.keys(snapshot.selectedRule.forbiddenCondition.requiredFacts),
  );

  return snapshot.transitions
    .map((transition): FactGate => {
      const constraints: FactConstraint[] = [];
      for (const [field, value] of Object.entries(transition.from.facts)) {
        if (ruleFactKeys.has(field)) {
          constraints.push({
            field,
            text: `${field} = ${formatFactValue(value as FactValue)}`,
            origin: "precondition",
          });
        }
      }
      for (const guard of transition.guards) {
        if (ruleFactKeys.has(guard.field)) {
          constraints.push({ field: guard.field, text: formatGuard(guard), origin: "guard" });
        }
      }
      const seen = new Set<string>();
      const unique = constraints.filter((item) => {
        if (seen.has(item.text)) return false;
        seen.add(item.text);
        return true;
      });
      return { transition, constraints: unique };
    })
    .filter((entry) => entry.constraints.length > 0);
}

/* ---------------------------------------------------------------- evidence */

export interface ResolvedEvidence {
  evidenceId: string;
  /** Full analyzer evidence record, or null when the id cannot be resolved. */
  item: EvidenceItem | null;
  /** File/line as cited by the rule reference. */
  citedFile: string;
  citedLine: number;
}

/** Resolves a rule's evidence references against the analyzer evidence corpus. */
export function resolveEvidence(rule: NeverRule, evidence: EvidenceItem[]): ResolvedEvidence[] {
  const byId = new Map(evidence.map((item) => [item.id, item]));
  return rule.evidence.map((reference) => ({
    evidenceId: reference.evidenceId,
    item: byId.get(reference.evidenceId) ?? null,
    citedFile: reference.file,
    citedLine: reference.line,
  }));
}

/** Distinct evidence types backing a rule — the independent-signal kinds. */
export function evidenceSignalTypes(resolved: ResolvedEvidence[]): string[] {
  const types = new Set<string>();
  for (const entry of resolved) {
    if (entry.item) types.add(entry.item.type);
  }
  return [...types].sort();
}

/* ------------------------------------------------------ condition rendering */

/** Compact, machine-faithful rendering of a forbidden condition. */
export function conditionClauses(condition: ForbiddenCondition): string[] {
  return [
    `state = ${condition.targetState}`,
    ...Object.entries(condition.requiredFacts).map(
      ([key, value]) => `${key} = ${formatFactValue(value as FactValue)}`,
    ),
  ];
}

export function conditionSummary(condition: ForbiddenCondition): string {
  return conditionClauses(condition).join(" ∧ ");
}

/* ---------------------------------------------------------------- terminal */

export interface TerminalLine {
  text: string;
  tone: Tone;
  marker: "ok" | "bad" | "none" | "prompt";
  emphasis?: boolean;
}

/**
 * Builds the verify-run transcript shown in the terminal card. Every line is
 * derived from snapshot values — no timings and no invented output.
 */
export function terminalScript(snapshot: ScenarioSnapshot): TerminalLine[] {
  const { search, proof, selectedRule } = snapshot;
  const lines: TerminalLine[] = [
    { text: `nevergraph verify ${selectedRule.id}`, tone: "neutral", marker: "prompt" },
    {
      text: `rule loaded — ${selectedRule.id} (${selectedRule.confidence} confidence)`,
      tone: "ok",
      marker: "ok",
    },
    {
      text: `bounded graph explored — ${search.exploredStateCount} states, depth ≤ ${search.limits.maxDepth}`,
      tone: "ok",
      marker: "ok",
    },
  ];

  if (search.status === "found") {
    lines.push({ text: "forbidden state reachable", tone: "bad", marker: "bad" });
    const witness = snapshot.witness;
    if (witness) {
      lines.push({ text: "", tone: "neutral", marker: "none" });
      lines.push({ text: "minimum witness:", tone: "neutral", marker: "none" });
      lines.push({
        text: witness.steps.map((step) => step.action).join(" → "),
        tone: "bad",
        marker: "none",
      });
    }
  } else if (search.status === "unreachable") {
    lines.push({ text: "forbidden state unreachable within bound", tone: "ok", marker: "ok" });
  } else {
    lines.push({ text: "exploration bound reached — inconclusive", tone: "warn", marker: "bad" });
  }

  if (proof) {
    const testName = proof.testFile.split("/").pop() ?? proof.testFile;
    lines.push({ text: "", tone: "neutral", marker: "none" });
    lines.push({ text: "running generated regression...", tone: "neutral", marker: "none" });

    if (proof.testResult === "pass") {
      lines.push({ text: `PASS  ${testName}`, tone: "ok", marker: "ok" });
      lines.push({ text: `exit ${proof.exitCode ?? 0}`, tone: "neutral", marker: "none" });
      lines.push({ text: "", tone: "neutral", marker: "none" });
      lines.push({
        text: "NEGATIVE SPECIFICATION PRESERVED",
        tone: "ok",
        marker: "none",
        emphasis: true,
      });
    } else if (proof.testResult === "fail") {
      lines.push({ text: `FAIL  ${testName}`, tone: "bad", marker: "bad" });
      lines.push({ text: `exit ${proof.exitCode ?? 1}`, tone: "neutral", marker: "none" });
      lines.push({ text: "", tone: "neutral", marker: "none" });
      lines.push({
        text: "FORBIDDEN BEHAVIOR REPRODUCED",
        tone: "bad",
        marker: "none",
        emphasis: true,
      });
    } else {
      lines.push({ text: `ERROR ${testName}`, tone: "warn", marker: "bad" });
      lines.push({
        text: "runner failure — not a confirmed violation",
        tone: "warn",
        marker: "none",
      });
    }
  } else {
    lines.push({ text: "", tone: "neutral", marker: "none" });
    lines.push({
      text: "no regression test executed for this scenario",
      tone: "neutral",
      marker: "none",
    });
  }

  return lines;
}
