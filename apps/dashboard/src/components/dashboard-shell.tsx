"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Boxes,
  FlaskConical,
  Lock,
  Network,
  Quote,
  ScanSearch,
  TriangleAlert,
} from "lucide-react";
import { cn } from "@/lib/cn";
import {
  conditionSummary,
  deriveWitnessHighlight,
  liveWitness,
  resolveEvidence,
  scenarioVerdict,
} from "@/data/derive";
import { SCENARIO_IDS, type ScenarioId } from "@/data/snapshot-schema";
import type { DashboardData } from "@/data/types";
import { ChangePanel, StatusBanner } from "./change-panel";
import { ContextStatesPanel } from "./context-states-panel";
import { EvidencePanel } from "./evidence-panel";
import { GraphCanvas } from "./graph/graph-canvas";
import { ProofPanel, SearchMetadataPanel, TerminalCard } from "./proof-panel";
import { RuleDetail, RuleList } from "./rule-panel";
import { ScenarioSelector } from "./scenario-selector";
import { Badge, Metric, Panel, PanelHeader } from "./ui/primitives";
import { VerdictStrip } from "./verdict-strip";
import { WitnessPanel } from "./witness-panel";

const SECTIONS = [
  { id: "overview", label: "Overview", icon: ScanSearch },
  { id: "rules", label: "Never Rules", icon: Lock },
  { id: "evidence", label: "Evidence", icon: Quote },
  { id: "proof", label: "Proof", icon: FlaskConical },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

/** Cadence for the optional scenario cycle. Slow enough to read each state. */
const DEMO_INTERVAL_MS = 4200;

function isScenarioId(value: string | null): value is ScenarioId {
  return value !== null && (SCENARIO_IDS as readonly string[]).includes(value);
}

export function DashboardShell({ data }: { data: DashboardData }) {
  const [scenario, setScenario] = useState<ScenarioId>("baseline");
  const [section, setSection] = useState<SectionId>("overview");
  const [selectedRuleId, setSelectedRuleId] = useState(data.goldenRuleId);
  const [playing, setPlaying] = useState(false);

  // Honour ?scenario=baseline|changed|repaired on first paint (PRD demo script).
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("scenario");
    if (isScenarioId(fromUrl)) setScenario(fromUrl);
  }, []);

  // Keep the URL shareable without triggering a navigation or re-render.
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("scenario", scenario);
    window.history.replaceState(null, "", url.toString());
  }, [scenario]);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setScenario((current) => {
        const next = (SCENARIO_IDS.indexOf(current) + 1) % SCENARIO_IDS.length;
        return SCENARIO_IDS[next];
      });
    }, DEMO_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [playing]);

  const snapshot = data.scenarios[scenario];
  const verdict = scenarioVerdict(snapshot);

  const selectedRule = useMemo(
    () => data.rules.find((rule) => rule.id === selectedRuleId) ?? data.rules[0],
    [data.rules, selectedRuleId],
  );

  /**
   * Scenarios were captured against one rule. Selecting a different rule shows
   * its real recovered definition and evidence, but the reachability, witness
   * and proof panels must say they have no capture rather than reuse another
   * rule's numbers.
   */
  const analysisMatchesSelection = selectedRule.id === snapshot.selectedRule.id;

  const highlight = useMemo(
    () => deriveWitnessHighlight(liveWitness(snapshot), snapshot.graph.nodes),
    [snapshot],
  );

  const resolvedEvidence = useMemo(
    () => resolveEvidence(selectedRule, data.evidence),
    [selectedRule, data.evidence],
  );
  const resolvedCount = resolvedEvidence.filter((entry) => entry.item !== null).length;

  const onSelectScenario = useCallback((next: ScenarioId) => {
    setScenario(next);
    setPlaying(false);
  }, []);

  const notCaptured = (
    <Panel className="flex flex-col items-center gap-2 py-8 text-center">
      <TriangleAlert className="size-5 text-warn" />
      <p className="font-mono text-[12px] font-bold text-warn">NO BOUNDED SEARCH CAPTURED</p>
      <p className="max-w-md text-[12px] leading-snug text-ink-muted">
        The captured scenarios were searched against{" "}
        <span className="font-mono text-ink">{snapshot.selectedRule.id}</span>. Reachability,
        counterexample and proof results are not available for{" "}
        <span className="font-mono text-ink">{selectedRule.id}</span>, and nothing is substituted in
        their place.
      </p>
      <button
        type="button"
        onClick={() => setSelectedRuleId(snapshot.selectedRule.id)}
        className="mt-1 rounded border border-line-strong bg-raised px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-ink-muted transition-colors hover:text-ink"
      >
        Back to {snapshot.selectedRule.id}
      </button>
    </Panel>
  );

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      {/* ------------------------------------------------------------ header */}
      <header className="sticky top-0 z-20 border-b border-line bg-canvas/95 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-3">
          <div className="flex items-center gap-3">
            <div className="flex size-8 items-center justify-center rounded-md border border-line-strong bg-raised">
              <Network className="size-4 text-accent" />
            </div>
            <div>
              <h1 className="text-[15px] font-semibold leading-none tracking-tight text-ink">
                NeverGraph
              </h1>
              <p className="mt-1 text-[11px] leading-none text-ink-dim">
                The Negative Specification Compiler
              </p>
            </div>
            <span className="ml-2 hidden border-l border-line pl-3 text-[11px] leading-snug text-ink-muted lg:block">
              Recover what your software has learned must never happen.
            </span>
          </div>

          <div className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5">
            <Boxes className="size-3.5 text-ink-dim" />
            <div className="leading-tight">
              <div className="font-mono text-[12px] font-semibold text-ink">
                {data.repository.name}
              </div>
              <div className="font-mono text-[10px] text-ink-dim">{data.repository.path}</div>
            </div>
          </div>
        </div>

        {/* DISCOVER → COMPILE → PROVE narrative, plus the scenario control. */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-2.5">
          <div className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.12em]">
            <span className="text-accent">discover</span>
            <span className="text-ink-dim">→</span>
            <span className="text-accent">compile</span>
            <span className="text-ink-dim">→</span>
            <span className="text-accent">prove</span>
            <span className="ml-2 hidden font-sans text-[11px] font-normal normal-case tracking-normal text-ink-dim xl:block">
              Bob recovers the rule · NeverGraph compiles it · the graph and the test prove it
            </span>
          </div>

          <ScenarioSelector
            value={scenario}
            onChange={onSelectScenario}
            scenarios={data.scenarios}
            playing={playing}
            onTogglePlay={() => setPlaying((current) => !current)}
          />
        </div>
      </header>

      <div className="flex flex-1 flex-col lg:flex-row">
        {/* ----------------------------------------------------------- nav */}
        <nav className="shrink-0 border-b border-line px-3 py-3 lg:w-[188px] lg:border-b-0 lg:border-r">
          <ul className="flex gap-1.5 lg:flex-col">
            {SECTIONS.map((entry) => {
              const Icon = entry.icon;
              const active = entry.id === section;
              return (
                <li key={entry.id} className="flex-1 lg:flex-none">
                  <button
                    type="button"
                    onClick={() => setSection(entry.id)}
                    aria-current={active}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[12.5px] transition-colors",
                      active
                        ? "bg-raised text-ink shadow-[inset_0_0_0_1px_var(--color-line)]"
                        : "text-ink-dim hover:bg-panel hover:text-ink-muted",
                    )}
                  >
                    <Icon className="size-3.5 shrink-0" />
                    <span className="truncate">{entry.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="mt-4 hidden flex-col gap-2 border-t border-line pt-4 lg:flex">
            <span className="label-micro">Active scenario</span>
            <Badge tone={verdict.searchTone} className="w-fit">
              {snapshot.scenario} · {verdict.searchLabel}
            </Badge>
            <span className="label-micro mt-2">Rule</span>
            <span className="font-mono text-[11px] text-ink-muted">{selectedRule.id}</span>
            <span className="label-micro mt-2">Artifacts</span>
            <span className="font-mono text-[10px] leading-relaxed text-ink-dim">
              rules.json
              <br />
              evidence.json
              <br />
              scenarios/{scenario}.json
            </span>
          </div>
        </nav>

        {/* ---------------------------------------------------------- main */}
        <main className="min-w-0 flex-1 px-5 py-4">
          {/* Summary metrics — real values only. */}
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
            <Metric
              label="Latent rules recovered"
              value={data.rules.length}
              hint="by IBM Bob, from evidence"
            />
            <Metric
              label="Repository"
              value={data.repository.name}
              hint={data.repository.path}
              mono
            />
            <Metric label="Selected rule" value={selectedRule.id} hint={selectedRule.confidence} />
            <Metric
              label="Search"
              value={analysisMatchesSelection ? verdict.searchLabel : "—"}
              tone={analysisMatchesSelection ? verdict.searchTone : "neutral"}
              hint={analysisMatchesSelection ? `${snapshot.search.exploredStateCount} states` : "not captured"}
            />
            <Metric
              label="Minimum witness"
              value={
                analysisMatchesSelection && snapshot.search.status === "found" && snapshot.witness
                  ? `${snapshot.witness.length} transitions`
                  : "—"
              }
              tone={
                analysisMatchesSelection && snapshot.search.status === "found" ? "bad" : "neutral"
              }
              hint={
                analysisMatchesSelection && snapshot.search.status === "found"
                  ? `depth ${snapshot.search.depth ?? "—"}`
                  : "no live counterexample"
              }
            />
            <Metric
              label="Executable proof"
              value={analysisMatchesSelection ? (verdict.proofLabel ?? "NOT RUN") : "—"}
              tone={analysisMatchesSelection ? verdict.proofTone : "neutral"}
              hint={
                analysisMatchesSelection && snapshot.proof
                  ? `exit ${snapshot.proof.exitCode ?? "—"}`
                  : "no proof run"
              }
            />
          </div>

          {/* ------------------------------------------------------ overview */}
          {section === "overview" ? (
            <div className="mt-4 flex flex-col gap-4">
              <VerdictStrip
                scenarios={data.scenarios}
                active={scenario}
                onSelect={onSelectScenario}
                ruleId={snapshot.selectedRule.id}
              />

              {analysisMatchesSelection ? (
                <>
                  <StatusBanner snapshot={snapshot} />

                  {/* The graph is the hero: full width, so it renders near 1:1
                      at 1080p and above instead of being fit-scaled down. */}
                  <div className="grid grid-cols-1 gap-4">
                    <Panel inset={false} className="flex min-w-0 flex-col overflow-hidden">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
                        <div>
                          <h2 className="label-micro">Context-aware behavior graph</h2>
                          <p className="mt-1 text-[11.5px] text-ink-muted">
                            {snapshot.graph.nodes.length} states ·{" "}
                            {snapshot.graph.edges.length} transitions · forbidden when{" "}
                            <span className="font-mono text-bad">
                              {conditionSummary(snapshot.selectedRule.forbiddenCondition)}
                            </span>
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {highlight.nodeIds.length > 0 ? (
                            <Badge tone="bad">counterexample highlighted</Badge>
                          ) : (
                            <Badge tone="ok">no forbidden state</Badge>
                          )}
                        </div>
                      </div>

                      <div className="h-[600px] min-w-0">
                        <GraphCanvas snapshot={snapshot} highlight={highlight} />
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-line px-4 py-2 font-mono text-[10px] text-ink-dim">
                        <span className="flex items-center gap-1.5">
                          <span className="inline-block h-0.5 w-4 bg-bad" /> counterexample path
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="inline-block size-2.5 rounded-sm border border-bad bg-bad-soft" />{" "}
                          forbidden state
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="text-bad">✓</span> fact that arms the rule
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="text-ok">✓</span> other lifecycle fact
                        </span>
                      </div>
                    </Panel>
                  </div>

                  <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[400px_minmax(0,1fr)]">
                    <WitnessPanel snapshot={snapshot} />
                    <div className="flex min-w-0 flex-col gap-4">
                      <ChangePanel scenario={scenario} scenarios={data.scenarios} />
                      <ContextStatesPanel snapshot={snapshot} />
                    </div>
                  </div>
                </>
              ) : (
                notCaptured
              )}
            </div>
          ) : null}

          {/* --------------------------------------------------------- rules */}
          {section === "rules" ? (
            <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
              <RuleList
                rules={data.rules}
                selectedRuleId={selectedRule.id}
                onSelect={setSelectedRuleId}
                goldenRuleId={snapshot.selectedRule.id}
              />
              <RuleDetail
                rule={selectedRule}
                evidence={data.evidence}
                isGolden={selectedRule.id === data.goldenRuleId}
              />
            </div>
          ) : null}

          {/* ------------------------------------------------------ evidence */}
          {section === "evidence" ? (
            <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
              <EvidencePanel rule={selectedRule} evidence={data.evidence} />
              <Panel className="flex flex-col gap-3">
                <PanelHeader
                  title="Evidence corpus"
                  subtitle="Everything the analyzer extracted from the repository"
                  icon={<Quote className="size-3.5" />}
                />
                <dl className="divide-y divide-line">
                  <div className="flex items-baseline justify-between py-1.5">
                    <dt className="font-mono text-[11px] text-ink-dim">total items</dt>
                    <dd className="font-mono text-[12px] text-ink">{data.evidence.length}</dd>
                  </div>
                  <div className="flex items-baseline justify-between py-1.5">
                    <dt className="font-mono text-[11px] text-ink-dim">cited by {selectedRule.id}</dt>
                    <dd className="font-mono text-[12px] text-ink">{selectedRule.evidence.length}</dd>
                  </div>
                  <div className="flex items-baseline justify-between py-1.5">
                    <dt className="font-mono text-[11px] text-ink-dim">resolved</dt>
                    <dd
                      className={cn(
                        "font-mono text-[12px]",
                        resolvedCount === selectedRule.evidence.length ? "text-ok" : "text-warn",
                      )}
                    >
                      {resolvedCount} / {selectedRule.evidence.length}
                    </dd>
                  </div>
                </dl>
                <p className="text-[11px] leading-snug text-ink-dim">
                  Evidence was extracted deterministically by the ts-morph analyzer. IBM Bob read
                  this corpus to synthesise the negative invariants — it did not invent them.
                </p>
              </Panel>
            </div>
          ) : null}

          {/* --------------------------------------------------------- proof */}
          {section === "proof" ? (
            analysisMatchesSelection ? (
              <div className="mt-4 flex flex-col gap-4">
                <StatusBanner snapshot={snapshot} />
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                  <TerminalCard snapshot={snapshot} />
                  <ProofPanel snapshot={snapshot} />
                  <SearchMetadataPanel snapshot={snapshot} />
                </div>
                <WitnessPanel snapshot={snapshot} />
              </div>
            ) : (
              <div className="mt-4">{notCaptured}</div>
            )
          ) : null}
        </main>
      </div>

      <footer className="border-t border-line px-5 py-3">
        <p className="text-[10.5px] leading-snug text-ink-dim">
          Read-only view over captured deterministic artifacts in{" "}
          <span className="font-mono">.nevergraph/</span>. Never Rules were recovered by IBM Bob
          from analyzer evidence. Reachability results are bounded behavioral exploration over the
          extracted transition table, not full formal verification.
        </p>
      </footer>
    </div>
  );
}
