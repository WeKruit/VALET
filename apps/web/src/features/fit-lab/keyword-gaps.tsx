import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@valet/ui/components/card";
import { Badge } from "@valet/ui/components/badge";
import { CheckCircle2, XCircle, Lightbulb } from "lucide-react";
import type { KeywordGap } from "@valet/shared/schemas";
import { cn } from "@/lib/utils";

interface KeywordGapsProps {
  gaps: KeywordGap[];
  compact?: boolean;
}

const IMPORTANCE_ORDER: Record<string, number> = {
  required: 0,
  preferred: 1,
  nice_to_have: 2,
};

export function KeywordGaps({ gaps, compact = false }: KeywordGapsProps) {
  const [filter, setFilter] = useState<"all" | "injectable" | "missing">("all");

  const sorted = [...gaps].sort(
    (a, b) => (IMPORTANCE_ORDER[a.importance] ?? 3) - (IMPORTANCE_ORDER[b.importance] ?? 3),
  );

  const filtered =
    filter === "all"
      ? sorted
      : filter === "injectable"
        ? sorted.filter((g) => g.injectable)
        : sorted.filter((g) => !g.injectable);

  const injectableCount = gaps.filter((g) => g.injectable).length;
  const missingCount = gaps.filter((g) => !g.injectable).length;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className={compact ? "text-xs" : "text-sm"}>
            Keyword Gaps ({gaps.length})
          </CardTitle>
          <div className="flex gap-1">
            <Badge
              variant={injectableCount > 0 ? "success" : "secondary"}
              className="text-[9px] cursor-default"
            >
              {injectableCount} fixable
            </Badge>
            <Badge
              variant={missingCount > 0 ? "error" : "secondary"}
              className="text-[9px] cursor-default"
            >
              {missingCount} gaps
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Filter tabs */}
        <div className="flex gap-1 rounded-[var(--wk-radius-md)] bg-[var(--wk-surface-sunken)] p-0.5">
          {(
            [
              { value: "all", label: `All (${gaps.length})` },
              { value: "injectable", label: `Fixable (${injectableCount})` },
              { value: "missing", label: `Gaps (${missingCount})` },
            ] as const
          ).map((tab) => (
            <button
              key={tab.value}
              onClick={() => setFilter(tab.value)}
              className={cn(
                "flex-1 rounded-[var(--wk-radius-sm)] px-2 py-1 text-[10px] font-medium transition-colors cursor-pointer",
                filter === tab.value
                  ? "bg-[var(--wk-surface-page)] text-[var(--wk-text-primary)] shadow-sm"
                  : "text-[var(--wk-text-tertiary)] hover:text-[var(--wk-text-secondary)]",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Gap list */}
        <div className="space-y-1.5">
          {filtered.map((gap, i) => (
            <div
              key={i}
              className={cn(
                "rounded-[var(--wk-radius-sm)] border p-2",
                gap.injectable
                  ? "border-emerald-200 bg-emerald-50/30 dark:border-emerald-800 dark:bg-emerald-950/10"
                  : "border-[var(--wk-border-subtle)] bg-[var(--wk-surface-sunken)]",
              )}
            >
              <div className="flex items-start gap-2">
                {gap.injectable ? (
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--wk-status-success)]" />
                ) : (
                  <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--wk-status-error)]" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-[var(--wk-text-primary)]">
                      {gap.keyword}
                    </span>
                    <Badge
                      variant={
                        gap.importance === "required"
                          ? "error"
                          : gap.importance === "preferred"
                            ? "warning"
                            : "info"
                      }
                      className="text-[8px] px-1"
                    >
                      {gap.importance.replace("_", " ")}
                    </Badge>
                  </div>
                  {gap.suggestion && (
                    <div className="mt-1 flex items-start gap-1">
                      <Lightbulb className="mt-0.5 h-3 w-3 shrink-0 text-[var(--wk-accent-amber)]" />
                      <p className="text-[10px] text-[var(--wk-text-secondary)]">
                        {gap.suggestion}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="py-4 text-center text-xs text-[var(--wk-text-tertiary)]">
              No gaps in this category
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
