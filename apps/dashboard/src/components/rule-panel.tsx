"use client";

import { Bot, Braces, Crosshair, Lock } from "lucide-react";
import type { EvidenceItem, NeverRule } from "@nevergraph/schemas";
import { cn } from "@/lib/cn";
import {
  conditionClauses,
  evidenceSignalTypes,
  resolveEvidence,
  type Tone,
} from "@/data/derive";
import { Badge, Code, KeyValue, Panel, PanelHeader, ProvenanceChip } from "./ui/primitives";

const CONFIDENCE_TONE: Record<NeverRule["confidence"], Tone> = {
  high: "ok",
  medium: "warn",
  low: "neutral",
};

/**
 * The full set of latent Never Rules recovered by IBM Bob.
 *
 * Every field — id, description, confidence, forbidden condition, evidence
 * references — is rendered from `.nevergraph/rules.json`. No rule text is
 * duplicated in UI constants.
 */
export function RuleList({
  rules,
  selectedRuleId,
  onSelect,
  goldenRuleId,
  className,
}: {
  rules: NeverRule[];
  selectedRuleId: string;
  onSelect: (ruleId: string) => void;
  goldenRuleId: string;
  className?: string;
}) {
  return (
    <Panel className={cn("flex flex-col gap-3", className)}>
      <PanelHeader
        title="Never Rules"
        subtitle={`${rules.length} latent negative invariants recovered from repository evidence`}
        icon={<Lock className="size-3.5" />}
        actions={<ProvenanceChip>Recovered by IBM Bob</ProvenanceChip>}
      />

      <ul className="flex flex-col gap-1.5">
        {rules.map((rule) => {
          const selected = rule.id === selectedRuleId;
          return (
            <li key={rule.id}>
              <button
                type="button"
                onClick={() => onSelect(rule.id)}
                aria-current={selected}
                className={cn(
                  "w-full rounded-md border px-3 py-2.5 text-left transition-colors",
                  selected
                    ? "border-accent-line bg-accent-soft/60"
                    : "border-line bg-surface hover:border-line-strong hover:bg-raised",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <span
                      className={cn(
                        "font-mono text-[12px] font-bold tracking-wide",
                        selected ? "text-accent" : "text-ink",
                      )}
                    >
                      {rule.id}
                    </span>
                    {rule.id === goldenRuleId ? (
                      <Badge tone="neutral" className="border-line-strong">
                        analysed
                      </Badge>
                    ) : null}
                  </span>
                  <Badge tone={CONFIDENCE_TONE[rule.confidence]}>{rule.confidence}</Badge>
                </div>

                <p className="mt-1.5 text-[13px] leading-snug text-ink">{rule.description}</p>

                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] text-ink-dim">
                  <span className="text-ink-muted">
                    {conditionClauses(rule.forbiddenCondition).join(" ∧ ")}
                  </span>
                  <span>
                    {rule.evidence.length} evidence{rule.evidence.length === 1 ? "" : " refs"}
                  </span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

/**
 * Detail for the selected rule: Bob's recovered description plus the compiled,
 * machine-evaluable forbidden condition the graph engine actually evaluates.
 */
export function RuleDetail({
  rule,
  evidence,
  isGolden,
  className,
}: {
  rule: NeverRule;
  evidence: EvidenceItem[];
  isGolden: boolean;
  className?: string;
}) {
  const resolved = resolveEvidence(rule, evidence);
  const signals = evidenceSignalTypes(resolved);
  const clauses = conditionClauses(rule.forbiddenCondition);

  return (
    <Panel className={cn("flex flex-col gap-4", className)}>
      <PanelHeader
        title="Selected rule"
        icon={<Crosshair className="size-3.5" />}
        actions={
          isGolden ? (
            <Badge tone="neutral" className="border-line-strong">
              golden demo rule
            </Badge>
          ) : null
        }
      />

      <div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[15px] font-bold tracking-wide text-ink">{rule.id}</span>
          <Badge tone={CONFIDENCE_TONE[rule.confidence]}>{rule.confidence} confidence</Badge>
        </div>
        <p className="mt-2 text-[15px] leading-snug text-ink">{rule.description}</p>
        <div className="mt-2.5 flex items-center gap-2">
          <ProvenanceChip>
            <Bot className="size-3" />
            Recovered by IBM Bob
          </ProvenanceChip>
        </div>
      </div>

      <div className="rounded-md border border-line bg-surface p-3">
        <div className="flex items-center gap-1.5">
          <Braces className="size-3 text-ink-dim" />
          <span className="label-micro">Compiled forbidden condition</span>
        </div>
        <div className="mt-2.5 flex flex-col gap-1">
          {clauses.map((clause, index) => (
            <div key={clause} className="flex items-center gap-2">
              {index > 0 ? (
                <span className="w-3 shrink-0 text-center font-mono text-[11px] text-ink-dim">
                  ∧
                </span>
              ) : (
                <span className="w-3 shrink-0" />
              )}
              <code className="flex-1 rounded border border-bad-line bg-bad-soft px-2 py-1 font-mono text-[12px] text-bad">
                {clause}
              </code>
            </div>
          ))}
        </div>
        <p className="mt-2.5 text-[11px] leading-snug text-ink-dim">
          A state satisfying every clause is forbidden. The graph engine evaluates this directly —
          the rule text above is documentation, this is the executable specification.
        </p>
      </div>

      <dl className="divide-y divide-line border-t border-line pt-1">
        <KeyValue label="evidence refs">{resolved.length}</KeyValue>
        <KeyValue label="signal kinds">
          {signals.length > 0 ? signals.join(", ") : "unresolved"}
        </KeyValue>
        <KeyValue label="target state">{rule.forbiddenCondition.targetState}</KeyValue>
        <KeyValue label="required facts">
          {Object.keys(rule.forbiddenCondition.requiredFacts).join(", ")}
        </KeyValue>
      </dl>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="label-micro">Cites</span>
        {resolved.map((entry) => (
          <Code key={entry.evidenceId} className={entry.item ? undefined : "text-warn"}>
            {entry.evidenceId}
          </Code>
        ))}
      </div>
    </Panel>
  );
}
