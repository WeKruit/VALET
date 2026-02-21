import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@valet/ui/components/card";
import { Badge } from "@valet/ui/components/badge";
import { Button } from "@valet/ui/components/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@valet/ui/components/select";
import { TaskProgress } from "./task-progress";
import { FieldReview } from "./field-review";
import { HitlBlockerCard } from "./hitl-blocker-card";
import { GhJobCard } from "./gh-job-card";
import { ActivityFeed } from "./activity-feed";
import { useTask } from "../hooks/use-tasks";
import { useTaskWebSocket } from "../hooks/use-task-websocket";
import { useSSEEvents } from "../hooks/use-sse-events";
import { api } from "@/lib/api-client";
import { LoadingSpinner } from "@/components/common/loading-spinner";
import { toast } from "sonner";
import { ExternalLink, RefreshCw, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { LiveView } from "./live-view";
import { useVncUrl } from "../hooks/use-vnc-url";

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

const EXTERNAL_STATUS_OPTIONS = [
  { value: "none", label: "Not set" },
  { value: "applied", label: "Applied" },
  { value: "viewed", label: "Viewed" },
  { value: "interview", label: "Interview" },
  { value: "rejected", label: "Rejected" },
  { value: "offer", label: "Offer" },
  { value: "ghosted", label: "Ghosted" },
];

export function TaskDetail({ taskId }: TaskDetailProps) {
  const { data, isLoading, isError } = useTask(taskId);
  const { status: wsStatus } = useTaskWebSocket(taskId);

  // Compute terminal status before SSE hook so we skip connections for finished tasks
  const taskData = data?.status === 200 ? data.body : null;
  const isTerminalTask =
    taskData?.status === "completed" ||
    taskData?.status === "cancelled" ||
    taskData?.status === "failed";
  const { latestEvent: sseEvent, status: sseStatus } = useSSEEvents(taskId, !isTerminalTask);
  const { data: vncData } = useVncUrl(taskId, !isTerminalTask);
  const vncUrl = vncData?.status === 200 ? vncData.body.url : null;
  const [showErrorDetails, setShowErrorDetails] = useState(false);
  const [showLiveView, setShowLiveView] = useState(false);
  const queryClient = useQueryClient();

  const cancelTask = api.tasks.cancel.useMutation({
    onSuccess: () => {
      toast.success("Task cancelled.");
    },
    onError: () => {
      toast.error("Failed to cancel task. Please try again.");
    },
  });

  const retryTask = api.tasks.retry.useMutation({
    onSuccess: () => {
      toast.success("Task retry submitted to GhostHands.");
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: () => {
      toast.error("Failed to retry task.");
    },
  });

  const updateExternalStatus = api.tasks.updateExternalStatus.useMutation({
    onSuccess: () => {
      toast.success("External status updated.");
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: () => {
      toast.error("Failed to update external status.");
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
  const hasHitlBlocker = isWaitingReview && task.interaction != null;
  const needsFieldReview = isWaitingReview && !task.interaction;
  const isTerminal =
    task.status === "completed" || task.status === "cancelled" || task.status === "failed";

  return (
    <div className="space-y-6">
      {/* Status banner for field review (copilot mode) */}
      {needsFieldReview && (
        <div className="rounded-[var(--wk-radius-lg)] border-2 border-[var(--wk-status-warning)] bg-amber-50/50 dark:bg-amber-950/10 p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-[var(--wk-status-warning)] shrink-0" />
          <div>
            <p className="text-sm font-medium">This application needs your review</p>
            <p className="text-xs text-[var(--wk-text-secondary)] mt-0.5">
              Review the auto-filled fields below and approve to submit.
            </p>
          </div>
        </div>
      )}

      {/* Task Info Card */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-xl">Task Details</CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
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
              {/* SSE stream indicator */}
              <div className="flex items-center gap-1.5">
                <div
                  className={`h-2 w-2 rounded-full ${
                    sseStatus === "connected"
                      ? "bg-[var(--wk-status-success)]"
                      : sseStatus === "connecting"
                        ? "bg-[var(--wk-status-warning)] animate-pulse"
                        : "bg-[var(--wk-text-tertiary)]"
                  }`}
                />
                <span className="text-xs text-[var(--wk-text-tertiary)]">
                  {sseStatus === "connected"
                    ? "SSE"
                    : sseStatus === "connecting"
                      ? "SSE..."
                      : "SSE off"}
                </span>
              </div>
              <Badge variant={task.mode === "copilot" ? "copilot" : "autopilot"}>{task.mode}</Badge>
              <Badge variant={statusBadgeVariant[task.status] ?? "default"} className="capitalize">
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
            <div className="min-w-0">
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
                    style={{ width: `${sseEvent ? sseEvent.progress_pct : task.progress}%` }}
                  />
                </div>
                <span className="text-sm font-medium">
                  {sseEvent ? `${sseEvent.progress_pct}%` : `${task.progress}%`}
                </span>
              </div>
              {sseEvent?.description && (
                <p className="mt-1 text-xs text-[var(--wk-text-tertiary)]">
                  {sseEvent.description}
                </p>
              )}
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
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-[var(--wk-text-secondary)]">
                External Status
              </p>
              <Select
                value={task.externalStatus ?? "none"}
                onValueChange={(v) =>
                  updateExternalStatus.mutate({
                    params: { id: taskId },
                    body: { externalStatus: v === "none" ? null : (v as any) },
                  })
                }
              >
                <SelectTrigger className="mt-1 w-full">
                  <SelectValue placeholder="Set status..." />
                </SelectTrigger>
                <SelectContent>
                  {EXTERNAL_STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Live View - only for active tasks with VNC URL */}
      {!isTerminal && vncUrl && (
        <LiveView
          url={vncUrl}
          isVisible={showLiveView}
          onToggle={() => setShowLiveView(!showLiveView)}
        />
      )}

      {/* HITL Blocker Card - browser automation blocked */}
      {hasHitlBlocker && task.interaction && (
        <HitlBlockerCard
          taskId={taskId}
          interaction={{
            type: task.interaction.type,
            screenshotUrl: task.interaction.screenshotUrl,
            pageUrl: task.interaction.pageUrl,
            timeoutSeconds: task.interaction.timeoutSeconds,
            message: task.interaction.message,
            description: task.interaction.description,
            metadata: task.interaction.metadata,
            pausedAt:
              task.interaction.pausedAt instanceof Date
                ? task.interaction.pausedAt.toISOString()
                : String(task.interaction.pausedAt),
          }}
          onCancel={() =>
            cancelTask.mutate({
              params: { id: taskId },
              body: {},
            })
          }
        />
      )}

      {/* GhostHands Job Status */}
      {task.ghJob && <GhJobCard ghJob={task.ghJob} />}

      {/* Activity Feed - real GH job events timeline */}
      {task.ghJob && <ActivityFeed taskId={taskId} isTerminal={isTerminal} />}

      {/* Field Review Panel - copilot field review */}
      {needsFieldReview && (
        <FieldReview
          taskId={taskId}
          task={{
            jobTitle: task.jobTitle,
            companyName: task.companyName,
            jobLocation: task.jobLocation,
            jobUrl: task.jobUrl,
            platform: task.platform,
            fieldsFilled: task.fieldsFilled,
            confidenceScore: task.confidenceScore,
          }}
        />
      )}

      {/* Error Details - for failed tasks */}
      {isFailed && (
        <Card className="border-[var(--wk-status-error)] border">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-[var(--wk-status-error)]" />
                <CardTitle className="text-lg text-[var(--wk-status-error)]">Task Failed</CardTitle>
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
              {task.errorMessage ??
                "An unexpected error occurred while processing this application."}
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
            <div className="flex gap-2 mt-2">
              {task.workflowRunId && (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={retryTask.isPending}
                  onClick={() => retryTask.mutate({ params: { id: taskId }, body: {} })}
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${retryTask.isPending ? "animate-spin" : ""}`}
                  />
                  {retryTask.isPending ? "Retrying..." : "Retry via GhostHands"}
                </Button>
              )}
              <Button asChild variant="ghost" size="sm">
                <Link to={`/apply?url=${encodeURIComponent(task.jobUrl)}`}>New Application</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Progress Timeline */}
      <TaskProgress
        progress={task.progress}
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
