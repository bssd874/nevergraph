"use client";

import { FlaskConical, Radar, SquareTerminal } from "lucide-react";
import { cn } from "@/lib/cn";
import type { ScenarioSnapshot } from "@/data/snapshot-schema";
import { scenarioVerdict, terminalScript } from "@/data/derive";
import {
  Badge,
  KeyValue,
  Panel,
  PanelHeader,
  StatusDot,
  TONE_TEXT,
} from "./ui/primitives";

/** What a REPRODUCED / NOT_REPRODUCED outcome actually means, in plain words. */
function proofMeaning(snapshot: ScenarioSnapshot): string {
  const proof = snapshot.proof;
  if (!proof) return "No regression test was executed for this scenario.";

  switch (proof.status) {
    case "reproduced":
      return "The generated negative-specification test failed because the forbidden path completed without throwing — the violation is real, not just a graph prediction.";
    case "not_reproduced":
      return "The same generated test now passes: replaying the counterexample throws before the forbidden state can be reached.";
    case "execution_error":
      return "The test runner failed for infrastructure reasons. This is not a confirmed violation.";
  }
}

/**
 * Executable proof for the selected scenario — the step that separates a static
 * prediction from a demonstrated violation. Values come from the runner
 * execution artifact embedded in the snapshot.
 */
export function ProofPanel({
  snapshot,
  className,
}: {
  snapshot: ScenarioSnapshot;
  className?: string;
}) {
  const verdict = scenarioVerdict(snapshot);
  const proof = snapshot.proof;

  return (
    <Panel className={cn("flex flex-col gap-3", className)}>
      <PanelHeader
        title="Executable proof"
        subtitle="Generated regression test, executed against the repository"
        icon={<FlaskConical className="size-3.5" />}
        actions={
          verdict.proofLabel ? (
            <Badge tone={verdict.proofTone}>{verdict.proofLabel}</Badge>
          ) : (
            <Badge tone="neutral">not run</Badge>
          )
        }
      />

      {proof ? (
        <>
          <div
            className={cn(
              "rounded-md border px-3 py-2.5",
              verdict.proofTone === "ok"
                ? "border-ok-line bg-ok-soft/40"
                : verdict.proofTone === "bad"
                  ? "border-bad-line bg-bad-soft/40"
                  : "border-warn-line bg-warn-soft/40",
            )}
          >
            <div className="flex items-center gap-2">
              <StatusDot tone={verdict.proofTone} />
              <span
                className={cn(
                  "font-mono text-[13px] font-bold uppercase tracking-wider",
                  TONE_TEXT[verdict.proofTone],
                )}
              >
                {verdict.proofLabel}
              </span>
              <span className="font-mono text-[10px] text-ink-dim">
                exit {proof.exitCode ?? "—"}
              </span>
            </div>
            <p className="mt-1.5 text-[11.5px] leading-snug text-ink-muted">
              {proofMeaning(snapshot)}
            </p>
          </div>

          <dl className="divide-y divide-line">
            <KeyValue label="generated test">{proof.testFile.split("/").pop()}</KeyValue>
            <KeyValue label="path">{proof.testFile}</KeyValue>
            <KeyValue label="test result" tone={proof.testResult === "pass" ? "ok" : "bad"}>
              {proof.testResult.toUpperCase()}
            </KeyValue>
            <KeyValue label="exit code" tone={proof.exitCode === 0 ? "ok" : "bad"}>
              {proof.exitCode ?? "—"}
            </KeyValue>
            <KeyValue label="timed out">{String(proof.timedOut)}</KeyValue>
            <KeyValue label="identifier">{proof.identifier}</KeyValue>
          </dl>
        </>
      ) : (
        <div className="rounded-md border border-line bg-surface px-3 py-4 text-center">
          <p className="font-mono text-[12px] text-ink-muted">NO PROOF RUN CAPTURED</p>
          <p className="mt-1.5 text-[11px] leading-snug text-ink-dim">
            This scenario has no forbidden state to reproduce, so no regression test was generated
            or executed for it.
          </p>
        </div>
      )}
    </Panel>
  );
}

/**
 * Bounded-search metadata. Exposed deliberately: the search is a bounded
 * behavioral exploration, not a full formal proof, and the bounds should be
 * visible rather than implied.
 */
export function SearchMetadataPanel({
  snapshot,
  className,
}: {
  snapshot: ScenarioSnapshot;
  className?: string;
}) {
  const { search } = snapshot;
  const verdict = scenarioVerdict(snapshot);

  return (
    <Panel className={cn("flex flex-col gap-3", className)}>
      <PanelHeader
        title="Bounded search metadata"
        icon={<Radar className="size-3.5" />}
        actions={<Badge tone={verdict.searchTone}>{verdict.searchLabel}</Badge>}
      />

      <dl className="divide-y divide-line">
        <KeyValue label="algorithm">Bounded BFS</KeyValue>
        <KeyValue label="state model">(status, facts) tuple</KeyValue>
        <KeyValue label="initial state">{snapshot.initialState.state}</KeyValue>
        <KeyValue label="depth" tone={search.depth === null ? "neutral" : "bad"}>
          {search.depth ?? "—"}
        </KeyValue>
        <KeyValue label="visited states">{search.exploredStateCount}</KeyValue>
        <KeyValue label="max depth">{search.limits.maxDepth}</KeyValue>
        <KeyValue label="max visited">{search.limits.maxVisitedStates}</KeyValue>
        <KeyValue label="graph nodes">{snapshot.graph.nodes.length}</KeyValue>
        <KeyValue label="graph edges">{snapshot.graph.edges.length}</KeyValue>
        <KeyValue label="transitions">{snapshot.transitions.length}</KeyValue>
        <KeyValue label="status" tone={verdict.searchTone}>
          {search.status}
        </KeyValue>
        {search.limitReason ? (
          <KeyValue label="limit reason" tone="warn">
            {search.limitReason}
          </KeyValue>
        ) : null}
      </dl>

      <p className="text-[11px] leading-snug text-ink-dim">
        {search.status === "unreachable"
          ? `Unreachable within the stated bounds — exhaustive for depth ≤ ${search.limits.maxDepth} over the extracted transition table, not a full mathematical verification.`
          : `Result holds over the extracted transition table under the stated bounds.`}
      </p>
    </Panel>
  );
}

/** Display-only transcript of a verify run. No timings, no fabricated output. */
export function TerminalCard({
  snapshot,
  className,
}: {
  snapshot: ScenarioSnapshot;
  className?: string;
}) {
  const lines = terminalScript(snapshot);

  return (
    <Panel inset={false} className={cn("overflow-hidden", className)}>
      <header className="flex items-center justify-between gap-2 border-b border-line bg-raised px-3 py-2">
        <div className="flex items-center gap-2">
          <SquareTerminal className="size-3.5 text-ink-dim" />
          <span className="label-micro">nevergraph cli</span>
        </div>
        <span className="font-mono text-[10px] text-ink-dim">{snapshot.scenario}</span>
      </header>

      <div className="bg-canvas px-3 py-3 font-mono text-[11.5px] leading-[1.7]">
        {lines.map((line, index) => (
          <div
            key={`${index}-${line.text}`}
            className={cn("flex gap-2", line.text === "" && "h-3")}
          >
            <span
              className={cn(
                "w-3 shrink-0 text-center",
                line.marker === "ok" && "text-ok",
                line.marker === "bad" && "text-bad",
                line.marker === "prompt" && "text-ink-dim",
              )}
              aria-hidden
            >
              {line.marker === "ok"
                ? "✓"
                : line.marker === "bad"
                  ? "✕"
                  : line.marker === "prompt"
                    ? "$"
                    : ""}
            </span>
            <span
              className={cn(
                "min-w-0 break-words",
                line.tone === "ok" && "text-ok",
                line.tone === "bad" && "text-bad",
                line.tone === "warn" && "text-warn",
                line.tone === "neutral" && "text-ink-muted",
                line.emphasis && "font-bold tracking-wider",
              )}
            >
              {line.text}
            </span>
          </div>
        ))}
      </div>

      <footer className="border-t border-line bg-surface px-3 py-2">
        <span className="text-[10px] text-ink-dim">
          Display only — reconstructed from the captured scenario and proof artifacts.
        </span>
      </footer>
    </Panel>
  );
}
