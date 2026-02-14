import { cn } from "@/lib/utils";

interface SandboxMetricsProps {
  currentLoad: number;
  capacity: number;
  className?: string;
}

export function SandboxMetrics({
  currentLoad,
  capacity,
  className,
}: SandboxMetricsProps) {
  const pct = capacity > 0 ? Math.round((currentLoad / capacity) * 100) : 0;
  const barColor =
    pct >= 90
      ? "bg-[var(--wk-status-error)]"
      : pct >= 70
        ? "bg-[var(--wk-status-warning)]"
        : "bg-[var(--wk-status-success)]";

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="h-2 w-20 rounded-full bg-[var(--wk-surface-sunken)] overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-500", barColor)}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <span className="text-xs font-medium text-[var(--wk-text-secondary)] tabular-nums">
        {currentLoad}/{capacity} ({pct}%)
      </span>
    </div>
  );
}
