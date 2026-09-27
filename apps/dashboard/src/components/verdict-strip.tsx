"use client";

import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { SCENARIO_IDS, type ScenarioId, type ScenarioSnapshot } from "@/data/snapshot-schema";
import { scenarioVerdict } from "@/data/derive";
import { Badge, TONE_BORDER, TONE_TEXT } from "./ui/primitives";

/** Human framing for what each captured scenario represents. */
const SCENARIO_TITLE: Record<ScenarioId, string> = {
  baseline: "Baseline",
  changed: "After support restore",
  repaired: "After repair",
};

/**
 * The three-state before/after summary — the single most important thing to
 * grasp within seconds of seeing the dashboard. Every value is read from the
 * scenario snapshots; the strip has no opinion of its own.
 */
export function VerdictStrip({
  scenarios,
  active,
  onSelect,
  ruleId,
}: {
  scenarios: Record<ScenarioId, ScenarioSnapshot>;
  active: ScenarioId;
  onSelect: (scenario: ScenarioId) => void;
  ruleId: string;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-stretch">
      {SCENARIO_IDS.map((scenario, index) => {
        const snapshot = scenarios[scenario];
        const verdict = scenarioVerdict(snapshot);
        const isActive = scenario === active;

        return [
          index > 0 ? (
            <div
              key={`${scenario}-arrow`}
              className="hidden items-center justify-center text-ink-dim md:flex"
              aria-hidden
            >
              <ArrowRight className="size-4" />
            </div>
          ) : null,

          <button
            key={scenario}
            type="button"
            onClick={() => onSelect(scenario)}
            aria-current={isActive}
            className={cn(
              "group relative flex flex-col gap-2 rounded-lg border bg-panel px-4 py-3 text-left transition-all",
              isActive
                ? cn(TONE_BORDER[verdict.searchTone], "bg-raised")
                : "border-line hover:border-line-strong",
            )}
          >
            {isActive ? (
              <span
                className={cn(
                  "absolute inset-x-0 top-0 h-[2px] rounded-t",
                  verdict.searchTone === "ok"
                    ? "bg-ok"
                    : verdict.searchTone === "bad"
                      ? "bg-bad"
                      : "bg-warn",
                )}
                aria-hidden
              />
            ) : null}

            <div className="flex items-center justify-between gap-2">
              <span className="label-micro">{SCENARIO_TITLE[scenario]}</span>
              <span className="font-mono text-[10px] uppercase tracking-wider text-ink-dim">
                {scenario}
              </span>
            </div>

            <div className="flex items-baseline gap-2">
              <span
                className={cn(
                  "font-mono text-[19px] font-bold leading-none tracking-tight",
                  TONE_TEXT[verdict.searchTone],
                )}
              >
                {verdict.searchLabel}
              </span>
              <span className={cn("text-[15px] leading-none", TONE_TEXT[verdict.searchTone])}>
                {verdict.searchTone === "ok" ? "✓" : verdict.searchTone === "bad" ? "✕" : "!"}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-[10px] text-ink-dim">{ruleId}</span>
              {verdict.proofLabel ? (
                <Badge tone={verdict.proofTone}>{verdict.proofLabel}</Badge>
              ) : (
                <span className="font-mono text-[10px] text-ink-dim">no proof run</span>
              )}
            </div>
          </button>,
        ];
      })}
    </div>
  );
}
