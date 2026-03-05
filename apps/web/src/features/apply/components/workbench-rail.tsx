import { Badge } from "@valet/ui/components/badge";
import { Button } from "@valet/ui/components/button";
import { AlertTriangle, Plus, Loader2, CheckCircle2, Clock } from "lucide-react";
import { useTasks } from "@/features/tasks/hooks/use-tasks";
import { formatRelativeTime } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { useWorkbenchStore } from "../stores/workbench.store";

const statusIcon: Record<string, React.ElementType> = {
  in_progress: Loader2,
  testing: Loader2,
  queued: Clock,
  created: Clock,
  waiting_human: AlertTriangle,
  completed: CheckCircle2,
  failed: AlertTriangle,
};

const statusColor: Record<string, string> = {
  in_progress: "text-[var(--wk-copilot)]",
  testing: "text-[var(--wk-copilot)]",
  queued: "text-[var(--wk-text-tertiary)]",
  created: "text-[var(--wk-text-tertiary)]",
  waiting_human: "text-[var(--wk-status-warning)]",
  completed: "text-[var(--wk-status-success)]",
  failed: "text-[var(--wk-status-error)]",
};

const FILTER_OPTIONS = [
  { value: "active" as const, label: "Active" },
  { value: "waiting" as const, label: "Needs Attention" },
  { value: "recent" as const, label: "Recent" },
] as const;

function filterToStatus(filter: "active" | "waiting" | "recent"): string | undefined {
  switch (filter) {
    case "active":
      return "in_progress";
    case "waiting":
      return "waiting_human";
    case "recent":
      return undefined;
  }
}

export function WorkbenchRail() {
  const { selectedTaskId, setSelectedTaskId, railFilter, setRailFilter } = useWorkbenchStore();

  const { data, isLoading } = useTasks({
    status: filterToStatus(railFilter),
    sortBy: "createdAt",
    sortOrder: "desc",
  });

  const tasks = data?.status === 200 ? data.body.data : [];

  return (
    <div className="flex h-full flex-col border-r border-[var(--wk-border-subtle)] bg-[var(--wk-surface-page)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--wk-border-subtle)] px-3 py-3">
        <h3 className="text-sm font-semibold text-[var(--wk-text-primary)]">Tasks</h3>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          title="New application"
          onClick={() => setSelectedTaskId(null)}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 border-b border-[var(--wk-border-subtle)] px-2 py-1.5">
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setRailFilter(opt.value)}
            className={cn(
              "rounded-[var(--wk-radius-md)] px-2 py-1 text-[11px] font-medium transition-colors cursor-pointer",
              railFilter === opt.value
                ? "bg-[var(--wk-surface-raised)] text-[var(--wk-text-primary)]"
                : "text-[var(--wk-text-tertiary)] hover:text-[var(--wk-text-secondary)]",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-4 w-4 animate-spin text-[var(--wk-text-tertiary)]" />
          </div>
        ) : tasks.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <p className="text-xs text-[var(--wk-text-tertiary)]">
              {railFilter === "waiting"
                ? "No tasks need attention"
                : railFilter === "active"
                  ? "No active tasks"
                  : "No recent tasks"}
            </p>
          </div>
        ) : (
          <div className="py-1">
            {tasks.map((task) => {
              const isSelected = task.id === selectedTaskId;
              const Icon = statusIcon[task.status] ?? Clock;
              const iconColor = statusColor[task.status] ?? "text-[var(--wk-text-tertiary)]";
              const isSpinning = task.status === "in_progress" || task.status === "testing";

              return (
                <button
                  key={task.id}
                  onClick={() => setSelectedTaskId(task.id)}
                  className={cn(
                    "flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors cursor-pointer",
                    isSelected
                      ? "bg-[var(--wk-surface-raised)]"
                      : "hover:bg-[var(--wk-surface-sunken)]",
                  )}
                >
                  <Icon
                    className={cn(
                      "mt-0.5 h-3.5 w-3.5 shrink-0",
                      iconColor,
                      isSpinning && "animate-spin",
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-[var(--wk-text-primary)]">
                      {task.companyName ?? task.jobTitle ?? "Application"}
                    </p>
                    <p className="truncate text-[11px] text-[var(--wk-text-tertiary)]">
                      {task.jobTitle ?? task.jobUrl}
                    </p>
                    <div className="mt-1 flex items-center gap-1.5">
                      {task.status === "waiting_human" && (
                        <Badge variant="warning" className="text-[9px] px-1 py-0 animate-pulse">
                          action needed
                        </Badge>
                      )}
                      {(task.status === "in_progress" || task.status === "testing") && (
                        <span className="text-[10px] text-[var(--wk-text-tertiary)]">
                          {task.progress}%
                        </span>
                      )}
                      <span className="text-[10px] text-[var(--wk-text-tertiary)]">
                        {formatRelativeTime(task.createdAt)}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
