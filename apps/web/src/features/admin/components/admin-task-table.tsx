import { useNavigate } from "react-router-dom";
import { Badge } from "@valet/ui/components/badge";
import { Button } from "@valet/ui/components/button";
import { Skeleton } from "@valet/ui/components/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@valet/ui/components/tooltip";
import { RefreshCw, CheckCircle2, AlertTriangle, ClipboardList, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { formatRelativeTime } from "@/lib/utils";
import { useSyncTask } from "../hooks/use-admin-tasks";
import type { AdminTask } from "../hooks/use-admin-tasks";

// ─── Status badge mappings ───

const taskStatusVariant: Record<string, "default" | "success" | "warning" | "error" | "info"> = {
  created: "default",
  queued: "default",
  in_progress: "info",
  waiting_human: "warning",
  completed: "success",
  failed: "error",
  cancelled: "default",
};

const ghStatusVariant: Record<string, "default" | "success" | "warning" | "error" | "info"> = {
  pending: "default",
  queued: "default",
  running: "info",
  completed: "success",
  failed: "error",
  cancelled: "default",
  needs_human: "warning",
};

// ─── Sync logic ───

/** Maps task status to the expected GH job status */
const expectedGhStatus: Record<string, string[]> = {
  failed: ["failed"],
  completed: ["completed"],
  cancelled: ["cancelled"],
  in_progress: ["running"],
  waiting_human: ["needs_human"],
  queued: ["queued", "pending"],
  created: ["pending", "queued"],
};

function getInSync(task: AdminTask): "synced" | "out_of_sync" | "no_gh_job" {
  if (!task.ghJob) return "no_gh_job";
  const expected = expectedGhStatus[task.status];
  if (!expected) return "synced"; // unknown status — assume ok
  return expected.includes(task.ghJob.ghStatus) ? "synced" : "out_of_sync";
}

// ─── Components ───

function SyncIndicator({ task }: { task: AdminTask }) {
  const sync = getInSync(task);
  if (sync === "no_gh_job") {
    return <span className="text-xs text-[var(--wk-text-tertiary)]">--</span>;
  }
  if (sync === "synced") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <CheckCircle2 className="h-4 w-4 text-[var(--wk-status-success)]" />
        </TooltipTrigger>
        <TooltipContent>In sync</TooltipContent>
      </Tooltip>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <AlertTriangle className="h-4 w-4 text-[var(--wk-status-warning)]" />
      </TooltipTrigger>
      <TooltipContent>
        Out of sync: task is "{task.status}" but GH job is "{task.ghJob?.ghStatus}"
      </TooltipContent>
    </Tooltip>
  );
}

function SyncButton({ taskId }: { taskId: string }) {
  const syncMutation = useSyncTask();

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-7 w-7"
      disabled={syncMutation.isPending}
      title="Sync status"
      onClick={(e) => {
        e.stopPropagation();
        syncMutation.mutate(taskId, {
          onSuccess: () => toast.success("Task synced."),
          onError: () => toast.error("Sync failed."),
        });
      }}
    >
      <RefreshCw className={`h-3.5 w-3.5 ${syncMutation.isPending ? "animate-spin" : ""}`} />
    </Button>
  );
}

// ─── Table ───

interface AdminTaskTableProps {
  tasks: AdminTask[];
  isLoading: boolean;
  isError: boolean;
}

export function AdminTaskTable({ tasks, isLoading, isError }: AdminTaskTableProps) {
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="py-12 text-center text-sm text-[var(--wk-status-error)]">
        Failed to load tasks. Please try refreshing.
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="py-12 text-center">
        <ClipboardList className="mx-auto h-10 w-10 text-[var(--wk-text-tertiary)]" />
        <p className="mt-3 text-sm font-medium text-[var(--wk-text-primary)]">No tasks found</p>
        <p className="mt-1 text-sm text-[var(--wk-text-secondary)]">Try adjusting your filters.</p>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--wk-border-subtle)]">
              <th className="pb-3 pr-4 text-left font-medium text-[var(--wk-text-secondary)]">
                Task ID
              </th>
              <th className="pb-3 pr-4 text-left font-medium text-[var(--wk-text-secondary)]">
                User
              </th>
              <th className="pb-3 pr-4 text-left font-medium text-[var(--wk-text-secondary)]">
                Job
              </th>
              <th className="pb-3 pr-4 text-left font-medium text-[var(--wk-text-secondary)]">
                Platform
              </th>
              <th className="pb-3 pr-4 text-left font-medium text-[var(--wk-text-secondary)]">
                Task Status
              </th>
              <th className="pb-3 pr-4 text-left font-medium text-[var(--wk-text-secondary)]">
                GH Status
              </th>
              <th className="pb-3 pr-4 text-center font-medium text-[var(--wk-text-secondary)]">
                Sync
              </th>
              <th className="pb-3 pr-4 text-left font-medium text-[var(--wk-text-secondary)]">
                Created
              </th>
              <th className="pb-3 text-right font-medium text-[var(--wk-text-secondary)]">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--wk-border-subtle)]">
            {tasks.map((task) => (
              <tr
                key={task.id}
                className="group hover:bg-[var(--wk-surface-raised)] transition-colors cursor-pointer"
                onClick={() => navigate(`/tasks/${task.id}`)}
              >
                <td className="py-3 pr-4 font-mono text-xs text-[var(--wk-text-secondary)]">
                  {task.id.slice(0, 8)}...
                </td>
                <td className="py-3 pr-4 font-mono text-xs text-[var(--wk-text-secondary)]">
                  {task.userId.slice(0, 8)}...
                </td>
                <td className="py-3 pr-4 max-w-[220px]">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-sm font-medium text-[var(--wk-text-primary)] truncate">
                      {task.jobTitle ?? task.companyName ?? "Untitled"}
                    </span>
                    <a
                      href={task.jobUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="shrink-0 text-[var(--wk-text-tertiary)] hover:text-[var(--wk-copilot)]"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                  {task.companyName && task.jobTitle && (
                    <span className="text-xs text-[var(--wk-text-tertiary)] truncate block">
                      {task.companyName}
                    </span>
                  )}
                </td>
                <td className="py-3 pr-4">
                  <Badge variant="default">{task.platform}</Badge>
                </td>
                <td className="py-3 pr-4">
                  <Badge
                    variant={taskStatusVariant[task.status] ?? "default"}
                    className="capitalize"
                  >
                    {task.status.replace(/_/g, " ")}
                  </Badge>
                </td>
                <td className="py-3 pr-4">
                  {task.ghJob ? (
                    <Badge
                      variant={ghStatusVariant[task.ghJob.ghStatus] ?? "default"}
                      className="capitalize"
                    >
                      {task.ghJob.ghStatus.replace(/_/g, " ")}
                    </Badge>
                  ) : (
                    <span className="text-xs text-[var(--wk-text-tertiary)]">--</span>
                  )}
                </td>
                <td className="py-3 pr-4 text-center">
                  <SyncIndicator task={task} />
                </td>
                <td className="py-3 pr-4 text-xs text-[var(--wk-text-secondary)] whitespace-nowrap">
                  {formatRelativeTime(task.createdAt)}
                </td>
                <td className="py-3 text-right">
                  <SyncButton taskId={task.id} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </TooltipProvider>
  );
}
