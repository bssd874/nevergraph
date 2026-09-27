import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { Tone } from "@/data/derive";

/**
 * Small shadcn-style primitives, hand-rolled rather than generated.
 * Every status colour in the app resolves through `TONE_*` so the semantic
 * mapping (ok / bad / warn / neutral) is defined exactly once.
 */

export const TONE_BADGE: Record<Tone, string> = {
  ok: "border-ok-line bg-ok-soft text-ok",
  bad: "border-bad-line bg-bad-soft text-bad",
  warn: "border-warn-line bg-warn-soft text-warn",
  neutral: "border-line-strong bg-raised text-ink-muted",
};

export const TONE_TEXT: Record<Tone, string> = {
  ok: "text-ok",
  bad: "text-bad",
  warn: "text-warn",
  neutral: "text-ink-muted",
};

export const TONE_BORDER: Record<Tone, string> = {
  ok: "border-ok-line",
  bad: "border-bad-line",
  warn: "border-warn-line",
  neutral: "border-line",
};

export const TONE_DOT: Record<Tone, string> = {
  ok: "bg-ok",
  bad: "bg-bad",
  warn: "bg-warn",
  neutral: "bg-ink-dim",
};

export function Badge({
  tone = "neutral",
  children,
  className,
  mono = true,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
  mono?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
        mono && "font-mono",
        TONE_BADGE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StatusDot({ tone, className }: { tone: Tone; className?: string }) {
  return (
    <span
      className={cn("inline-block size-1.5 shrink-0 rounded-full", TONE_DOT[tone], className)}
      aria-hidden
    />
  );
}

export function Panel({
  children,
  className,
  inset = true,
}: {
  children: ReactNode;
  className?: string;
  inset?: boolean;
}) {
  return (
    <section
      className={cn(
        "rounded-lg border border-line bg-panel shadow-[0_1px_0_0_rgba(255,255,255,0.02)_inset,0_8px_24px_-16px_rgba(0,0,0,0.8)]",
        inset && "p-4",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function PanelHeader({
  title,
  subtitle,
  icon,
  actions,
  className,
}: {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {icon ? <span className="text-ink-dim">{icon}</span> : null}
          <h2 className="label-micro">{title}</h2>
        </div>
        {subtitle ? (
          <p className="mt-1 text-[13px] leading-snug text-ink-muted">{subtitle}</p>
        ) : null}
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </header>
  );
}

/** Compact metric tile used across the summary strip. */
export function Metric({
  label,
  value,
  hint,
  tone = "neutral",
  mono = true,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: Tone;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-md border border-line bg-surface px-3 py-2.5">
      <div className="label-micro truncate">{label}</div>
      <div
        className={cn(
          "mt-1.5 truncate text-[15px] font-semibold leading-none",
          mono && "font-mono",
          tone === "neutral" ? "text-ink" : TONE_TEXT[tone],
        )}
      >
        {value}
      </div>
      {hint ? <div className="mt-1.5 truncate text-[11px] text-ink-dim">{hint}</div> : null}
    </div>
  );
}

/** Label/value row for dense technical detail lists. */
export function KeyValue({
  label,
  children,
  tone = "neutral",
}: {
  label: string;
  children: ReactNode;
  tone?: Tone;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <dt className="shrink-0 font-mono text-[11px] text-ink-dim">{label}</dt>
      <dd
        className={cn(
          "min-w-0 truncate text-right font-mono text-[12px]",
          tone === "neutral" ? "text-ink" : TONE_TEXT[tone],
        )}
      >
        {children}
      </dd>
    </div>
  );
}

export function Code({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <code
      className={cn(
        "rounded border border-line bg-surface px-1.5 py-0.5 font-mono text-[11px] text-ink-muted",
        className,
      )}
    >
      {children}
    </code>
  );
}

/** Attribution chip. Only ever applied to Bob-recovered rules. */
export function ProvenanceChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded border border-accent-line bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
      {children}
    </span>
  );
}
