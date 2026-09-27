"use client";

import { useMemo } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  ReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import {
  edgeKey,
  layoutGraph,
  satisfiesCondition,
  scenarioFactKeys,
  statesEqual,
  type WitnessHighlight,
} from "@/data/derive";
import type { ScenarioSnapshot } from "@/data/snapshot-schema";
import { NODE_TYPES, type StateNodeData } from "./state-node";

/**
 * Renders the context-aware behavior graph for one scenario snapshot.
 *
 * Nodes and edges come straight from the snapshot's captured graph; only the
 * positions are computed (deterministic BFS layering, so a recorded demo looks
 * identical on every run).
 */
export function GraphCanvas({
  snapshot,
  highlight,
}: {
  snapshot: ScenarioSnapshot;
  highlight: WitnessHighlight;
}) {
  const { nodes, edges } = useMemo(() => {
    const layout = layoutGraph(snapshot);
    const factKeys = scenarioFactKeys(snapshot);
    const ruleFactKeys = Object.keys(snapshot.selectedRule.forbiddenCondition.requiredFacts);
    const hasPath = highlight.nodeIds.length > 0;

    const flowNodes: Node<StateNodeData>[] = layout.nodes.map((positioned) => {
      const { node } = positioned;
      const onPath = highlight.nodeIdSet.has(node.id);
      // `forbidden` is re-evaluated against the rule rather than trusting the
      // optional snapshot flag, so the badge always matches the condition shown.
      const forbidden = satisfiesCondition(
        node.graphState,
        snapshot.selectedRule.forbiddenCondition,
      );

      return {
        id: node.id,
        type: "stateNode",
        position: { x: positioned.x, y: positioned.y },
        draggable: false,
        selectable: false,
        connectable: false,
        data: {
          label: node.label,
          facts: node.graphState.facts,
          factKeys,
          ruleFactKeys,
          forbidden,
          onPath,
          pathIndex: highlight.stepIndexByNodeId.get(node.id) ?? null,
          isInitial: statesEqual(node.graphState, snapshot.initialState),
          dimmed: hasPath && !onPath,
        },
      };
    });

    const flowEdges: Edge[] = layout.edges.map((edge) => {
      const onPath = highlight.edgeKeys.has(edgeKey(edge.source, edge.target, edge.action));
      const stroke = onPath ? "var(--color-bad)" : "var(--color-line-strong)";

      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: "smoothstep",
        label: edge.action,
        animated: onPath,
        selectable: false,
        className: onPath ? "ng-witness" : undefined,
        zIndex: onPath ? 2 : 1,
        style: {
          stroke,
          strokeWidth: onPath ? 2.25 : 1.25,
          opacity: hasPath && !onPath ? 0.28 : 1,
        },
        labelShowBg: true,
        labelBgPadding: [4, 2] as [number, number],
        labelBgBorderRadius: 3,
        labelBgStyle: { fill: "var(--color-canvas)", fillOpacity: 0.92 },
        labelStyle: {
          fill: onPath ? "var(--color-bad)" : "var(--color-ink-dim)",
          fontFamily: "var(--font-mono)",
          fontSize: 10,
        },
        markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: stroke },
      };
    });

    return { nodes: flowNodes, edges: flowEdges };
  }, [snapshot, highlight]);

  return (
    <ReactFlow
      // Remounting per scenario guarantees a fresh fitView on every switch.
      key={snapshot.scenario}
      nodes={nodes}
      edges={edges}
      nodeTypes={NODE_TYPES}
      fitView
      fitViewOptions={{ padding: 0.08, maxZoom: 1 }}
      minZoom={0.2}
      maxZoom={1.6}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      zoomOnScroll={false}
      zoomOnDoubleClick={false}
      panOnScroll={false}
      preventScrolling={false}
      proOptions={{ hideAttribution: true }}
      className="grid-backdrop"
    >
      <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="transparent" />
      <Controls
        showInteractive={false}
        className="!bottom-3 !left-3 overflow-hidden !rounded-md !border !border-line !shadow-none"
      />
    </ReactFlow>
  );
}
