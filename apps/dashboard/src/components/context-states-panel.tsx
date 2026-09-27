"use client";

import { Layers } from "lucide-react";
import { cn } from "@/lib/cn";
import type { ScenarioSnapshot } from "@/data/snapshot-schema";
import { formatFactValue, satisfiesCondition, scenarioFactKeys } from "@/data/derive";
import { Badge, Panel, PanelHeader } from "./ui/primitives";

/**
 * Groups the explored states by lifecycle status.
 *
 * This is the panel that makes context-awareness concrete: when one status
 * appears several times, those rows are genuinely different graph states that
 * differ only in accumulated fact context. A plain status-only graph would
 * collapse them and miss the violation entirely.
 */
export function ContextStatesPanel({
  snapshot,
  className,
}: {
  snapshot: ScenarioSnapshot;
  className?: string;
}) {
  const factKeys = scenarioFactKeys(snapshot);
  const ruleFactKeys = new Set(
    Object.keys(snapshot.selectedRule.forbiddenCondition.requiredFacts),
  );

  const byStatus = new Map<string, ScenarioSnapshot["graph"]["nodes"]>();
  for (const node of snapshot.graph.nodes) {
    const bucket = byStatus.get(node.label);
    if (bucket) bucket.push(node);
    else byStatus.set(node.label, [node]);
  }

  const groups = [...byStatus.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const splitCount = groups.filter(([, nodes]) => nodes.length > 1).length;

  return (
    <Panel className={cn("flex flex-col gap-3", className)}>
      <PanelHeader
        title="Context-aware states"
        subtitle={
          splitCount > 0
            ? `${splitCount} lifecycle ${splitCount === 1 ? "status splits" : "statuses split"} into multiple graph states by fact context`
            : "Every lifecycle status resolves to a single fact context here"
        }
        icon={<Layers className="size-3.5" />}
        actions={
          <Badge tone="neutral">
            {snapshot.graph.nodes.length} states / {groups.length} statuses
          </Badge>
        }
      />

      <div className="overflow-x-auto scroll-thin">
        <table className="w-full border-collapse font-mono text-[11px]">
          <thead>
            <tr className="border-b border-line">
              <th className="label-micro py-1.5 pr-3 text-left font-semibold">status</th>
              {factKeys.map((factKey) => (
                <th
                  key={factKey}
                  className={cn(
                    "label-micro px-2 py-1.5 text-center font-semibold",
                    ruleFactKeys.has(factKey) && "text-bad",
                  )}
                >
                  {factKey}
                </th>
              ))}
              <th className="label-micro py-1.5 pl-3 text-right font-semibold">verdict</th>
            </tr>
          </thead>
          <tbody>
            {groups.map(([status, nodes]) =>
              nodes.map((node, index) => {
                const forbidden = satisfiesCondition(
                  node.graphState,
                  snapshot.selectedRule.forbiddenCondition,
                );
                return (
                  <tr
                    key={node.id}
                    className={cn(
                      "border-b border-line/60",
                      forbidden && "bg-bad-soft/40",
                      index > 0 && "border-t-0",
                    )}
                  >
                    <td className="py-1.5 pr-3">
                      <span
                        className={cn(
                          "font-semibold",
                          forbidden ? "text-bad" : index === 0 ? "text-ink" : "text-ink-muted",
                        )}
                      >
                        {index === 0 ? status : <span className="text-ink-dim">↳ {status}</span>}
                      </span>
                    </td>

                    {factKeys.map((factKey) => {
                      const value = node.graphState.facts[factKey];
                      const present = value !== undefined && value !== null && value !== false;
                      const armed = present && ruleFactKeys.has(factKey);
                      return (
                        <td
                          key={factKey}
                          className={cn(
                            "px-2 py-1.5 text-center font-semibold",
                            !present && "text-ink-dim",
                            present && (armed ? "text-bad" : "text-ok"),
                          )}
                        >
                          {value === undefined
                            ? "—"
                            : value === true
                              ? "✓"
                              : formatFactValue(value)}
                        </td>
                      );
                    })}

                    <td className="py-1.5 pl-3 text-right">
                      {forbidden ? (
                        <Badge tone="bad">forbidden</Badge>
                      ) : (
                        <span className="text-[10px] text-ink-dim">allowed</span>
                      )}
                    </td>
                  </tr>
                );
              }),
            )}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] leading-snug text-ink-dim">
        Graph nodes are <span className="font-mono text-ink-muted">(status, facts)</span> tuples.
        Rows sharing a status are distinct states — identical lifecycle status, different history.
        Collapsing them to the status string alone is exactly what hides this class of violation.
      </p>
    </Panel>
  );
}
