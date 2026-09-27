"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Ban, Flag } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatFactValue, type FactValue } from "@/data/derive";

/**
 * A context-aware behavior-graph node.
 *
 * NeverGraph nodes are `(status, facts)` tuples, not status strings — so the
 * node always renders the fact context alongside the lifecycle status. Two
 * nodes sharing a status but differing in facts are genuinely different states
 * and must read as different states on screen.
 */
export interface StateNodeData extends Record<string, unknown> {
  /** Lifecycle status label, e.g. "PAID". */
  label: string;
  facts: Record<string, FactValue>;
  /** Fact keys to render, in stable order. Union across the scenario. */
  factKeys: string[];
  /** Fact keys named by the selected rule's forbidden condition. Never hidden. */
  ruleFactKeys: string[];
  /** True when this state satisfies the forbidden condition. */
  forbidden: boolean;
  /** True when this state lies on the highlighted counterexample. */
  onPath: boolean;
  /** 0-based position along the counterexample, or null. */
  pathIndex: number | null;
  isInitial: boolean;
  /** True when a path is highlighted and this state is not part of it. */
  dimmed: boolean;
}

function FactRow({
  factKey,
  value,
  isRuleFact,
}: {
  factKey: string;
  value: FactValue | undefined;
  isRuleFact: boolean;
}) {
  const present = value !== undefined && value !== null && value !== false;
  // A rule-relevant fact that is set is what arms the forbidden condition, so
  // it reads in the danger tone; other set facts are plain lifecycle context.
  const armed = present && isRuleFact;

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 px-2.5 py-[3px] font-mono text-[11px] leading-4",
        armed && "bg-bad-soft",
      )}
    >
      <span
        className={cn(
          "truncate",
          isRuleFact ? "text-ink-muted" : "text-ink-dim",
          armed && "text-bad",
        )}
      >
        {factKey}
      </span>
      <span
        className={cn(
          "shrink-0 font-semibold",
          !present && "text-ink-dim",
          present && (armed ? "text-bad" : "text-ok"),
        )}
      >
        {value === undefined ? "—" : value === true ? "✓" : formatFactValue(value)}
      </span>
    </div>
  );
}

export function StateNode({ data }: NodeProps & { data: StateNodeData }) {
  const ruleFactKeys = new Set(data.ruleFactKeys);

  return (
    <div
      className={cn(
        "w-[212px] overflow-hidden rounded-md border bg-panel transition-opacity",
        data.forbidden
          ? "border-bad shadow-[0_0_0_1px_var(--color-bad-line),0_0_28px_-6px_rgba(255,95,84,0.45)]"
          : data.onPath
            ? "border-bad-line shadow-[0_0_20px_-10px_rgba(255,95,84,0.4)]"
            : "border-line-strong",
        data.dimmed && "opacity-35",
      )}
    >
      <Handle type="target" position={Position.Left} />

      <header
        className={cn(
          "flex items-center justify-between gap-2 border-b px-2.5 py-2",
          data.forbidden
            ? "border-bad-line bg-bad-soft"
            : data.onPath
              ? "border-bad-line bg-raised"
              : "border-line bg-raised",
        )}
      >
        <div className="flex min-w-0 items-center gap-1.5">
          {data.forbidden ? <Ban className="size-3.5 shrink-0 text-bad" /> : null}
          {data.isInitial && !data.forbidden ? (
            <Flag className="size-3 shrink-0 text-ink-dim" />
          ) : null}
          <span
            className={cn(
              "truncate font-mono text-[12px] font-bold tracking-wide",
              data.forbidden ? "text-bad" : "text-ink",
            )}
          >
            {data.label}
          </span>
        </div>

        {data.pathIndex !== null ? (
          <span
            className={cn(
              "flex size-4 shrink-0 items-center justify-center rounded-full font-mono text-[9px] font-bold",
              data.forbidden ? "bg-bad text-canvas" : "bg-bad-soft text-bad",
            )}
            title={`Step ${data.pathIndex} of the counterexample`}
          >
            {data.pathIndex}
          </span>
        ) : data.isInitial ? (
          <span className="label-micro shrink-0">entry</span>
        ) : null}
      </header>

      <div className="divide-y divide-line py-0.5">
        {data.factKeys.map((factKey) => (
          <FactRow
            key={factKey}
            factKey={factKey}
            value={data.facts[factKey]}
            isRuleFact={ruleFactKeys.has(factKey)}
          />
        ))}
      </div>

      <Handle type="source" position={Position.Right} />
    </div>
  );
}

export const NODE_TYPES = { stateNode: StateNode } as const;
