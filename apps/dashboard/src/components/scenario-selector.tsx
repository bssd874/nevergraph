"use client";

import { Pause, Play } from "lucide-react";
import { cn } from "@/lib/cn";
import { SCENARIO_IDS, type ScenarioId, type ScenarioSnapshot } from "@/data/snapshot-schema";
import { scenarioVerdict, type Tone } from "@/data/derive";
import { StatusDot } from "./ui/primitives";

const SCENARIO_CAPTION: Record<ScenarioId, string> = {
  baseline: "as shipped",
  changed: "support restore added",
  repaired: "repair applied",
};

/**
 * Prominent segmented control. Switching the scenario re-reads every panel from
 * that scenario's captured snapshot — nothing in the UI is scenario-independent.
 */
export function ScenarioSelector({
  value,
  onChange,
  scenarios,
  playing,
  onTogglePlay,
}: {
  value: ScenarioId;
  onChange: (scenario: ScenarioId) => void;
  scenarios: Record<ScenarioId, ScenarioSnapshot>;
  playing: boolean;
  onTogglePlay: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <div
        role="tablist"
        aria-label="Scenario"
        className="flex items-stretch gap-1 rounded-lg border border-line bg-surface p-1"
      >
        {SCENARIO_IDS.map((scenario) => {
          const active = scenario === value;
          const tone: Tone = scenarioVerdict(scenarios[scenario]).searchTone;
          return (
            <button
              key={scenario}
              role="tab"
              type="button"
              aria-selected={active}
              onClick={() => onChange(scenario)}
              className={cn(
                "group flex min-w-[124px] flex-col gap-0.5 rounded-md px-3 py-1.5 text-left transition-colors",
                active
                  ? "bg-raised shadow-[inset_0_0_0_1px_var(--color-line-strong)]"
                  : "hover:bg-panel",
              )}
            >
              <span className="flex items-center gap-1.5">
                <StatusDot tone={tone} />
                <span
                  className={cn(
                    "font-mono text-[11px] font-bold uppercase tracking-wider",
                    active ? "text-ink" : "text-ink-dim group-hover:text-ink-muted",
                  )}
                >
                  {scenario}
                </span>
              </span>
              <span
                className={cn(
                  "truncate text-[10px]",
                  active ? "text-ink-muted" : "text-ink-dim/70",
                )}
              >
                {SCENARIO_CAPTION[scenario]}
              </span>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onTogglePlay}
        aria-pressed={playing}
        title={playing ? "Stop cycling scenarios" : "Cycle baseline → changed → repaired"}
        className={cn(
          "flex items-center gap-1.5 rounded-lg border px-2.5 py-2 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors",
          playing
            ? "border-accent-line bg-accent-soft text-accent"
            : "border-line bg-surface text-ink-dim hover:border-line-strong hover:text-ink-muted",
        )}
      >
        {playing ? <Pause className="size-3" /> : <Play className="size-3" />}
        {playing ? "Stop" : "Play demo"}
      </button>
    </div>
  );
}
