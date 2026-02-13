import { Link } from "react-router-dom";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@valet/ui/components/card";
import { Badge } from "@valet/ui/components/badge";
import { Button } from "@valet/ui/components/button";
import { TaskProgress } from "./task-progress";
import { FieldReview } from "./field-review";
import { useTask } from "../hooks/use-tasks";
import { useTaskWebSocket } from "../hooks/use-task-websocket";
import { api } from "@/lib/api-client";
import { LoadingSpinner } from "@/components/common/loading-spinner";
import { toast } from "sonner";
import {
  ExternalLink,
  RefreshCw,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useState } from "react";
import { formatDistanceToNow } from "date-fns";

interface TaskDetailProps {
  taskId: string;
}

const statusBadgeVariant: Record<
  string,
  "default" | "success" | "warning" | "error" | "info" | "copilot" | "autopilot"
> = {
  created: "default",
  queued: "default",
  in_progress: "info",
  waiting_human: "warning",
  completed: "success",
  failed: "error",
  cancelled: "default",
};

const platformLabels: Record<string, string> = {
  linkedin: "LinkedIn",
  greenhouse: "Greenhouse",
  lever: "Lever",
  workday: "Workday",
  unknown: "Unknown",
};

export function TaskDetail({ taskId }: TaskDetailProps) {
  const { data, isLoading, isError } = useTask(taskId);
  const { status: wsStatus } = useTaskWebSocket(taskId);
  const [showErrorDetails, setShowErrorDetails] = useState(false);

  const cancelTask = api.tasks.cancel.useMutation({
    onSuccess: () => {
      toast.success("Task cancelled.");
    },
    onError: () => {
      toast.error("Failed to cancel task. Please try again.");
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-[var(--wk-status-error)]">
          Failed to load task details. Please try refreshing the page.
        </CardContent>
      </Card>
    );
  }

  const task = data?.status === 200 ? data.body : null;
  if (!task) return null;

  const isFailed = task.status === "failed";
  const isWaitingReview = task.status === "waiting_human";
  const isTerminal =
    task.status === "completed" ||
    task.status === "cancelled" ||
    task.status === "failed";

  return (
    <div className="space-y-6">
      {/* Status banner for waiting_human */}
      {isWaitingReview && (
        <div className="rounded-[var(--wk-radius-lg)] border-2 border-[var(--wk-status-warning)] bg-amber-50/50 dark:bg-amber-950/10 p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-[var(--wk-status-warning)] shrink-0" />
          <div>
            <p className="text-sm font-medium">
              This application needs your review
            </p>
            <p className="text-xs text-[var(--wk-text-secondary)] mt-0.5">
              Review the auto-filled fields below and approve to submit.
            </p>
          </div>
        </div>
      )}

      {/* Task Info Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl">Task Details</CardTitle>
            <div className="flex items-center gap-2">
              {/* WebSocket connection indicator */}
              <div className="flex items-center gap-1.5">
                <div
                  className={`h-2 w-2 rounded-full ${
                    wsStatus === "connected"
                      ? "bg-[var(--wk-status-success)]"
                      : wsStatus === "connecting"
                        ? "bg-[var(--wk-status-warning)] animate-pulse"
                        : "bg-[var(--wk-status-error)]"
                  }`}
                />
                <span className="text-xs text-[var(--wk-text-tertiary)]">
                  {wsStatus === "connected" ? "Live" : wsStatus}
                </span>
              </div>
              <Badge
                variant={task.mode === "copilot" ? "copilot" : "autopilot"}
              >
                {task.mode}
              </Badge>
              <Badge
                variant={statusBadgeVariant[task.status] ?? "default"}
                className="capitalize"
              >
                {task.status.replace("_", " ")}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-[var(--wk-text-secondary)]">
                Platform
              </p>
              <p className="mt-1 text-sm font-medium">
                {platformLabels[task.platform] ?? task.platform}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-[var(--wk-text-secondary)]">
                Job URL
              </p>
              <a
                href={task.jobUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 text-sm text-[var(--wk-copilot)] hover:underline truncate flex items-center gap-1"
              >
                <span className="truncate">{task.jobUrl}</span>
                <ExternalLink className="h-3 w-3 shrink-0" />
              </a>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-[var(--wk-text-secondary)]">
                Progress
              </p>
              <div className="mt-1 flex items-center gap-2">
                <div className="h-2 w-24 rounded-full bg-[var(--wk-surface-sunken)] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[var(--wk-copilot)] to-[var(--wk-accent-teal)] transition-all duration-500"
                    style={{ width: `${task.progress}%` }}
                  />
                </div>
                <span className="text-sm font-medium">{task.progress}%</span>
              </div>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-[var(--wk-text-secondary)]">
                Created
              </p>
              <p className="mt-1 text-sm">
                {formatDistanceToNow(new Date(task.createdAt), {
                  addSuffix: true,
                })}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Field Review Panel - only for waiting_human */}
      {isWaitingReview && <FieldReview taskId={taskId} />}

      {/* Error Details - for failed tasks */}
      {isFailed && (
        <Card className="border-[var(--wk-status-error)] border">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-[var(--wk-status-error)]" />
                <CardTitle className="text-lg text-[var(--wk-status-error)]">
                  Task Failed
                </CardTitle>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowErrorDetails(!showErrorDetails)}
              >
                {showErrorDetails ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-[var(--wk-text-secondary)]">
              {task.errorMessage ?? "An unexpected error occurred while processing this application."}
            </p>
            {showErrorDetails && task.errorCode && (
              <div className="rounded-[var(--wk-radius-md)] bg-[var(--wk-surface-sunken)] p-3">
                <p className="text-xs font-mono text-[var(--wk-text-secondary)]">
                  Error Code: {task.errorCode}
                </p>
                {task.errorMessage && (
                  <p className="mt-1 text-xs font-mono text-[var(--wk-text-secondary)]">
                    {task.errorMessage}
                  </p>
                )}
              </div>
            )}
            <Button asChild variant="secondary" size="sm" className="mt-2">
              <Link to={`/apply?url=${encodeURIComponent(task.jobUrl)}`}>
                <RefreshCw className="h-3.5 w-3.5" />
                Retry Application
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Progress Timeline */}
      <TaskProgress
        currentStep={task.currentStep ?? "queued"}
        status={task.status}
        createdAt={task.createdAt}
        completedAt={task.completedAt}
      />

      {/* Action buttons */}
      {!isTerminal && !isWaitingReview && (
        <div className="flex gap-3">
          <Button
            variant="destructive"
            disabled={cancelTask.isPending}
            onClick={() =>
              cancelTask.mutate({
                params: { id: taskId },
                body: {},
              })
            }
          >
            {cancelTask.isPending ? "Cancelling..." : "Cancel Task"}
          </Button>
        </div>
      )}
    </div>
  );
}
