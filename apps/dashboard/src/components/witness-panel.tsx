"use client";

import { Archive, Route, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/cn";
import type { ScenarioSnapshot } from "@/data/snapshot-schema";
import { firstBlockedStepIndex, satisfiesCondition, witnessStepViews } from "@/data/derive";
import { Badge, KeyValue, Panel, PanelHeader } from "./ui/primitives";

/**
 * The minimum counterexample.
 *
 * Read entirely from the snapshot's witness; the step list is never hard-coded.
 * When the bounded search did not report "found", any witness present is the
 * *archived* sequence the generated regression test replays — it is labelled as
 * such and never presented as a live violation.
 */
export function WitnessPanel({
  snapshot,
  className,
}: {
  snapshot: ScenarioSnapshot;
  className?: string;
}) {
  const witness = snapshot.witness;
  const isLive = snapshot.search.status === "found";
  const steps = witnessStepViews(snapshot);
  const condition = snapshot.selectedRule.forbiddenCondition;
  // Where this scenario's transition table stops admitting the replayed path.
  const blockedIndex = isLive ? null : firstBlockedStepIndex(snapshot);

  if (!witness) {
    return (
      <Panel className={cn("flex flex-col gap-3", className)}>
        <PanelHeader
          title="Minimum counterexample"
          icon={<ShieldCheck className="size-3.5" />}
        />
        <div className="rounded-md border border-ok-line bg-ok-soft/40 px-3 py-4 text-center">
          <p className="font-mono text-[12px] font-bold text-ok">NO COUNTEREXAMPLE</p>
          <p className="mt-1.5 text-[11px] leading-snug text-ink-muted">
            The bounded search explored {snapshot.search.exploredStateCount} states without reaching
            a state that satisfies the forbidden condition.
          </p>
        </div>
      </Panel>
    );
  }

  return (
    <Panel className={cn("flex flex-col gap-3", className)}>
      <PanelHeader
        title="Minimum counterexample"
        subtitle={
          isLive
            ? "Shortest behavioral path from the entry state into the forbidden state"
            : "Archived counterexample — replayed by the generated regression test"
        }
        icon={isLive ? <Route className="size-3.5" /> : <Archive className="size-3.5" />}
        actions={
          isLive ? (
            <Badge tone="bad">live</Badge>
          ) : (
            <Badge tone="neutral">historical</Badge>
          )
        }
      />

      <ol className="flex flex-col">
        {steps.map((step, index) => {
          const isFinal = index === steps.length - 1;
          const reachesForbidden = isFinal && satisfiesCondition(step.toState, condition);
          const isBlocked = blockedIndex === index;

          return (
            <li key={`${step.ordinal}-${step.action}`} className="flex gap-3">
              {/* Rail: ordinal marker plus connector to the next step. */}
              <div className="flex flex-col items-center">
                <span
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full border font-mono text-[10px] font-bold",
                    reachesForbidden && isLive
                      ? "border-bad bg-bad text-canvas"
                      : isLive
                        ? "border-bad-line bg-bad-soft text-bad"
                        : isBlocked
                          ? "border-ok bg-ok-soft text-ok"
                          : "border-line-strong bg-raised text-ink-muted",
                  )}
                >
                  {step.ordinal}
                </span>
                {!isFinal ? (
                  <span
                    className={cn(
                      "w-px flex-1",
                      isLive ? "bg-bad-line" : "bg-line-strong",
                    )}
                    aria-hidden
                  />
                ) : null}
              </div>

              <div className={cn("min-w-0 flex-1", isFinal ? "pb-0" : "pb-3")}>
                <div className="flex flex-wrap items-center gap-2">
                  <code
                    className={cn(
                      "font-mono text-[12.5px] font-semibold",
                      reachesForbidden && isLive ? "text-bad" : "text-ink",
                    )}
                  >
                    {step.action}()
                  </code>
                  {step.transition ? (
                    <span className="font-mono text-[10px] text-ink-dim">
                      {step.transition.file}:{step.transition.line}
                    </span>
                  ) : null}
                </div>

                <div className="mt-1 flex flex-wrap items-center gap-1.5 font-mono text-[10.5px]">
                  <span className="text-ink-dim">{step.fromState.state}</span>
                  <span className="text-ink-dim">→</span>
                  <span className={cn(reachesForbidden && isLive ? "text-bad" : "text-ink-muted")}>
                    {step.toState.state}
                  </span>
                  {step.factsIntroduced.map((factKey) => (
                    <span
                      key={factKey}
                      className={cn(
                        "rounded border px-1 py-px text-[9.5px]",
                        factKey in condition.requiredFacts && isLive
                          ? "border-bad-line bg-bad-soft text-bad"
                          : "border-line bg-surface text-ink-dim",
                      )}
                    >
                      +{factKey}
                    </span>
                  ))}
                </div>

                {isBlocked ? (
                  <p className="mt-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-ok">
                    blocked by the repair — this transition can no longer fire
                  </p>
                ) : null}

                {reachesForbidden ? (
                  isLive ? (
                    <p className="mt-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-bad">
                      forbidden state reached
                    </p>
                  ) : (
                    <p className="mt-1.5 font-mono text-[10px] text-ink-dim">
                      unreachable in this scenario
                    </p>
                  )
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

      <dl className="divide-y divide-line border-t border-line pt-1">
        <KeyValue label="rule">{witness.ruleId}</KeyValue>
        <KeyValue label="transitions">{witness.length}</KeyValue>
        <KeyValue label="depth">{snapshot.search.depth ?? "—"}</KeyValue>
        <KeyValue label="visited states">{snapshot.search.exploredStateCount}</KeyValue>
        <KeyValue label="satisfies condition" tone={witness.isForbidden ? "bad" : "ok"}>
          {String(witness.isForbidden)}
        </KeyValue>
      </dl>
    </Panel>
  );
}
