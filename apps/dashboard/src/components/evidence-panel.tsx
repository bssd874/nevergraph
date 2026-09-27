"use client";

import { FileCode2, Quote, TriangleAlert } from "lucide-react";
import type { EvidenceItem, NeverRule } from "@nevergraph/schemas";
import { cn } from "@/lib/cn";
import { resolveEvidence, type ResolvedEvidence, type Tone } from "@/data/derive";
import { Badge, Panel, PanelHeader } from "./ui/primitives";

/**
 * Evidence-type tones. Guards and throws are code-level constraints; a negative
 * test is an executable assertion. Different kinds of signal reading differently
 * is the point — it shows the rule rests on independent evidence.
 */
const TYPE_TONE: Record<EvidenceItem["type"], Tone> = {
  negative_test: "ok",
  guard: "warn",
  throw: "bad",
  comment: "neutral",
  constraint: "neutral",
  state_transition: "neutral",
};

const TYPE_LABEL: Record<EvidenceItem["type"], string> = {
  negative_test: "negative test",
  guard: "guard",
  throw: "throw",
  comment: "comment",
  constraint: "constraint",
  state_transition: "state transition",
};

function EvidenceCard({ entry }: { entry: ResolvedEvidence }) {
  const { item } = entry;

  if (!item) {
    return (
      <li className="rounded-md border border-warn-line bg-warn-soft/40 p-3">
        <div className="flex items-center gap-2">
          <TriangleAlert className="size-3.5 text-warn" />
          <span className="font-mono text-[12px] font-bold text-warn">{entry.evidenceId}</span>
          <Badge tone="warn">unresolved</Badge>
        </div>
        <p className="mt-1.5 font-mono text-[11px] text-ink-dim">
          cited at {entry.citedFile}:{entry.citedLine} but absent from evidence.json
        </p>
      </li>
    );
  }

  return (
    <li className="rounded-md border border-line bg-surface p-3 transition-colors hover:border-line-strong">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[12px] font-bold text-ink">{item.id}</span>
          <Badge tone={TYPE_TONE[item.type]}>{TYPE_LABEL[item.type]}</Badge>
        </div>
        <span className="flex items-center gap-1.5 font-mono text-[10px] text-ink-dim">
          <FileCode2 className="size-3" />
          {item.file}:{item.line}
        </span>
      </div>

      <p className="mt-2 text-[13px] leading-snug text-ink">{item.summary}</p>

      <pre className="mt-2 overflow-x-auto rounded border border-line bg-canvas px-2.5 py-1.5 font-mono text-[11px] leading-relaxed text-ink-muted scroll-thin">
        <code>{item.snippet}</code>
      </pre>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] text-ink-dim">
        <span>
          symbol <span className="text-ink-muted">{item.symbol || "—"}</span>
        </span>
        {typeof item.metadata.testName === "string" ? (
          <span className="truncate">
            test <span className="text-ink-muted">&ldquo;{item.metadata.testName}&rdquo;</span>
          </span>
        ) : null}
      </div>
    </li>
  );
}

/**
 * "Why NeverGraph believes this rule exists" — resolves the selected rule's
 * evidence references against the analyzer's evidence corpus. If an id does not
 * resolve, that is shown as an unresolved reference rather than hidden.
 */
export function EvidencePanel({
  rule,
  evidence,
  className,
}: {
  rule: NeverRule;
  evidence: EvidenceItem[];
  className?: string;
}) {
  const resolved = resolveEvidence(rule, evidence);
  const distinctTypes = new Set(resolved.map((entry) => entry.item?.type).filter(Boolean));

  return (
    <Panel className={cn("flex flex-col gap-3", className)}>
      <PanelHeader
        title="Why NeverGraph believes this rule exists"
        subtitle={`${resolved.length} evidence references across ${distinctTypes.size} independent signal ${
          distinctTypes.size === 1 ? "kind" : "kinds"
        }`}
        icon={<Quote className="size-3.5" />}
        actions={
          <span className="font-mono text-[10px] text-ink-dim">
            {rule.id} · evidence.json
          </span>
        }
      />

      <ul className="flex flex-col gap-2">
        {resolved.map((entry) => (
          <EvidenceCard key={entry.evidenceId} entry={entry} />
        ))}
      </ul>

      <p className="text-[11px] leading-snug text-ink-dim">
        Independent signals matter: a guard and a throw show the constraint is enforced in code,
        while a negative test shows the team deliberately asserted the behaviour must fail. Neither
        alone is a specification — together they are recoverable evidence of one.
      </p>
    </Panel>
  );
}
