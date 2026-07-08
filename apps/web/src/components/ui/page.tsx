import * as React from "react";
import { cn } from "../../lib/utils.js";

// Shared page-level primitives so every page shares one hierarchy language:
// a header zone, a dense metric strip (not N separate cards), and teachable
// empty / error states. See DESIGN.md + PRODUCT.md.

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

// A metric strip: one bordered panel divided into cells, instead of a grid of
// separate cards. Breaks the "card grid on every page" monotony.
const COLS: Record<number, string> = {
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-3",
  4: "grid-cols-2 lg:grid-cols-4",
  5: "grid-cols-2 lg:grid-cols-5",
};

export function StatGrid({
  cols = 4,
  className,
  children,
}: {
  cols?: 2 | 3 | 4 | 5;
  className?: string;
  children: React.ReactNode;
}) {
  // gap-px over a border-colored background renders clean 1px separators that
  // wrap correctly regardless of item count.
  return (
    <div
      className={cn(
        "grid gap-px overflow-hidden rounded-lg border border-border bg-border",
        COLS[cols],
        className
      )}
    >
      {children}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  icon: Icon,
  emphasis = false,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon?: React.ComponentType<{ className?: string }>;
  emphasis?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[0.6875rem] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
        {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground/70" />}
      </div>
      <div className={cn("font-mono font-semibold tabular-nums", emphasis ? "text-2xl text-foreground" : "text-xl")}>
        {value}
      </div>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-border bg-card px-6 py-14 text-center">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="text-sm font-semibold">{title}</h3>
      {children && <div className="mt-1 max-w-sm text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}

export function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
      {children}
    </div>
  );
}
