"use client";

import { GitBranch, ShieldAlert, ShieldCheck, TriangleAlert, Wrench } from "lucide-react";
import { cn } from "@/lib/cn";
import type { ScenarioId, ScenarioSnapshot } from "@/data/snapshot-schema";
import {
  diffTransitions,
  factGatedTransitions,
  formatGuard,
  scenarioVerdict,
  type ScenarioVerdict,
} from "@/data/derive";
import { Badge, Panel, PanelHeader, TONE_TEXT } from "./ui/primitives";

/**
 * The headline verdict for the active scenario — the one element that should be
 * readable from across a room during a recorded demo.
 */
export function StatusBanner({
  snapshot,
  className,
}: {
  snapshot: ScenarioSnapshot;
  className?: string;
}) {
  const verdict: ScenarioVerdict = scenarioVerdict(snapshot);
  const Icon =
    verdict.searchTone === "bad"
      ? ShieldAlert
      : verdict.searchTone === "ok"
        ? ShieldCheck
        : TriangleAlert;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border px-5 py-4",
        verdict.searchTone === "bad"
          ? "border-bad-line bg-gradient-to-r from-bad-soft to-panel"
          : verdict.searchTone === "ok"
            ? "border-ok-line bg-gradient-to-r from-ok-soft to-panel"
            : "border-warn-line bg-gradient-to-r from-warn-soft to-panel",
        className,
      )}
    >
      <div className="flex items-start gap-3.5">
        <Icon className={cn("mt-0.5 size-6 shrink-0", TONE_TEXT[verdict.searchTone])} />

        <div className="min-w-0 flex-1">
          <h2
            className={cn(
              "font-mono text-[15px] font-bold uppercase tracking-[0.06em]",
              TONE_TEXT[verdict.searchTone],
            )}
          >
            {verdict.headline}
          </h2>

          <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="font-mono text-[13px] font-bold text-ink">
              {snapshot.selectedRule.id}
            </span>
            <Badge tone={verdict.searchTone}>{verdict.searchLabel}</Badge>
            {verdict.proofLabel ? (
              <Badge tone={verdict.proofTone}>{verdict.proofLabel}</Badge>
            ) : null}
          </div>

          <p className="mt-2 text-[13px] leading-snug text-ink-muted">{verdict.detail}</p>
          <p className="mt-0.5 text-[12.5px] leading-snug text-ink-dim">
            {snapshot.selectedRule.description}
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Explains what changed between scenarios, derived by diffing the captured
 * transition tables (keyed by action + endpoints, so transition-id renumbering
 * between captures does not produce phantom changes).
 *
 * Attribution note: the repair is reported as applied and verified. It is not
 * attributed to IBM Bob — only the Never Rules were Bob-recovered.
 */
export function ChangePanel({
  scenario,
  scenarios,
  className,
}: {
  scenario: ScenarioId;
  scenarios: Record<ScenarioId, ScenarioSnapshot>;
  className?: string;
}) {
  const baseline = scenarios.baseline;
  const changed = scenarios.changed;
  const repaired = scenarios.repaired;

  if (scenario === "baseline") {
    const gates = factGatedTransitions(baseline);
    return (
      <Panel className={cn("flex flex-col gap-3", className)}>
        <PanelHeader
          title="Transition table"
          subtitle="The behavior extracted from the repository as it currently ships"
          icon={<GitBranch className="size-3.5" />}
          actions={<Badge tone="neutral">{baseline.transitions.length} transitions</Badge>}
        />
        <ul className="flex flex-col gap-1">
          {baseline.transitions.map((transition) => (
            <li
              key={transition.id}
              className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded border border-line bg-surface px-2.5 py-1.5 font-mono text-[11px]"
            >
              <span className="text-ink-dim">{transition.id}</span>
              <span className="font-semibold text-ink">{transition.action}</span>
              <span className="text-ink-muted">
                {transition.from.state} → {transition.to.state}
              </span>
              <span className="ml-auto text-ink-dim">
                {transition.file}:{transition.line}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-[11px] leading-snug text-ink-dim">
          {gates.length === 0
            ? `No transition constrains ${Object.keys(baseline.selectedRule.forbiddenCondition.requiredFacts).join(", ")} — the rule holds here because no path re-enters a shippable state after a refund.`
            : `${gates.length} transition${gates.length === 1 ? "" : "s"} constrain a fact the selected rule depends on.`}
        </p>
      </Panel>
    );
  }

  if (scenario === "changed") {
    const diff = diffTransitions(baseline.transitions, changed.transitions);
    return (
      <Panel className={cn("flex flex-col gap-3", className)}>
        <PanelHeader
          title="What changed"
          subtitle="Diff of the extracted transition table against the baseline capture"
          icon={<GitBranch className="size-3.5" />}
          actions={
            <Badge tone="bad">
              +{diff.added.length} transition{diff.added.length === 1 ? "" : "s"}
            </Badge>
          }
        />

        {diff.added.map((transition) => (
          <div
            key={transition.id}
            className="rounded-md border border-bad-line bg-bad-soft/40 px-3 py-2.5"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[10px] font-bold text-bad">NEW TRANSITION</span>
              <code className="font-mono text-[12.5px] font-semibold text-ink">
                {transition.action}
              </code>
              <span className="font-mono text-[11px] text-ink-muted">
                {transition.from.state} → {transition.to.state}
              </span>
            </div>
            <div className="mt-1.5 font-mono text-[10.5px] text-ink-dim">
              {transition.file}:{transition.line}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {transition.guards.length === 0 ? (
                <span className="font-mono text-[10.5px] text-warn">no guards extracted</span>
              ) : (
                transition.guards.map((guard) => (
                  <code
                    key={formatGuard(guard)}
                    className="rounded border border-line bg-canvas px-1.5 py-0.5 font-mono text-[10.5px] text-ink-muted"
                  >
                    {formatGuard(guard)}
                  </code>
                ))
              )}
            </div>
            <p className="mt-2 text-[11.5px] leading-snug text-ink-muted">
              This transition re-enters <code className="font-mono">{transition.to.state}</code>{" "}
              without constraining{" "}
              <code className="font-mono text-bad">
                {Object.keys(changed.selectedRule.forbiddenCondition.requiredFacts).join(", ")}
              </code>
              , so a state that already carries the refund fact can reach a shippable state again.
            </p>
          </div>
        ))}

        {diff.modified.length > 0 ? (
          <ul className="flex flex-col gap-1.5">
            {diff.modified.map((entry) => (
              <li
                key={entry.after.id}
                className="rounded border border-warn-line bg-warn-soft/30 px-2.5 py-1.5 font-mono text-[11px]"
              >
                <span className="font-semibold text-ink">{entry.after.action}</span>
                <span className="ml-2 text-ink-dim">guards changed</span>
              </li>
            ))}
          </ul>
        ) : null}
      </Panel>
    );
  }

  // Repaired scenario.
  const diff = diffTransitions(changed.transitions, repaired.transitions);
  const gates = factGatedTransitions(repaired);
  const ruleFactKeys = Object.keys(repaired.selectedRule.forbiddenCondition.requiredFacts);

  return (
    <Panel className={cn("flex flex-col gap-3", className)}>
      <PanelHeader
        title="Repair applied"
        subtitle="Diff of the extracted transition table against the changed capture"
        icon={<Wrench className="size-3.5" />}
        actions={<Badge tone="ok">repair verified</Badge>}
      />

      {diff.modified.length === 0 && diff.removed.length === 0 ? (
        <p className="text-[12px] text-ink-muted">
          No transition-level difference was captured between the changed and repaired scenarios.
        </p>
      ) : null}

      {diff.modified.map((entry) => (
        <div
          key={entry.after.id}
          className="rounded-md border border-ok-line bg-ok-soft/30 px-3 py-2.5"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[10px] font-bold text-ok">CONSTRAINT ADDED</span>
            <code className="font-mono text-[12.5px] font-semibold text-ink">
              {entry.after.action}
            </code>
            <span className="font-mono text-[11px] text-ink-muted">
              {entry.after.from.state} → {entry.after.to.state}
            </span>
          </div>
          <div className="mt-1.5 font-mono text-[10.5px] text-ink-dim">
            {entry.after.file}:{entry.after.line}
          </div>

          <div className="mt-2 flex flex-col gap-1">
            {entry.addedFactPreconditions.map(([field, value]) => (
              <code
                key={`fact-${field}`}
                className="rounded border border-ok-line bg-canvas px-2 py-1 font-mono text-[11px] text-ok"
              >
                + precondition: {field} = {value === null ? "null" : String(value)}
              </code>
            ))}
            {entry.addedGuards.map((guard) => (
              <code
                key={formatGuard(guard)}
                className="rounded border border-ok-line bg-canvas px-2 py-1 font-mono text-[11px] text-ok"
              >
                + guard: {formatGuard(guard)}
              </code>
            ))}
          </div>

          <p className="mt-2 text-[11.5px] leading-snug text-ink-muted">
            <code className="font-mono">{entry.after.action}</code> can no longer fire from a state
            that carries{" "}
            <code className="font-mono text-ink">{ruleFactKeys.join(", ")}</code>, so the
            historical-refund path cannot traverse it. The unsafe{" "}
            <code className="font-mono">{entry.after.to.state}</code> state with the refund fact set
            is no longer constructible.
          </p>
        </div>
      ))}

      {gates.length > 0 ? (
        <div className="rounded-md border border-line bg-surface px-3 py-2.5">
          <span className="label-micro">Fact-gated transitions</span>
          <ul className="mt-2 flex flex-col gap-1.5">
            {gates.map((gate) => (
              <li key={gate.transition.id} className="flex flex-wrap items-center gap-2">
                <code className="font-mono text-[11.5px] font-semibold text-ink">
                  {gate.transition.action}
                </code>
                {gate.constraints.map((constraint) => (
                  <span key={constraint.text} className="flex items-center gap-1.5">
                    <span className="font-mono text-[10.5px] text-ink-dim">
                      {constraint.origin === "precondition" ? "requires" : "and"}
                    </span>
                    <code className="rounded border border-ok-line bg-ok-soft/40 px-1.5 py-0.5 font-mono text-[10.5px] text-ok">
                      {constraint.text}
                    </code>
                  </span>
                ))}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="rounded-md border border-line bg-surface px-3 py-2">
        <p className="text-[11px] leading-snug text-ink-dim">
          Graph effect: the changed capture explored{" "}
          <span className="font-mono text-ink-muted">{changed.graph.nodes.length}</span> distinct
          context-aware states; after the repair it explores{" "}
          <span className="font-mono text-ink-muted">{repaired.graph.nodes.length}</span> — the
          states that carried a historical refund into a shippable status are gone.
        </p>
      </div>
    </Panel>
  );
}
