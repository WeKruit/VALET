import { Card, CardContent, CardHeader, CardTitle } from "@valet/ui/components/card";
import { Badge } from "@valet/ui/components/badge";
import { Bot, Clock, DollarSign, Zap } from "lucide-react";
import { formatDistanceStrict } from "date-fns";
import type { GhJob } from "@valet/shared/schemas";

interface GhJobCardProps {
  ghJob: GhJob;
}

const statusColors: Record<string, "default" | "success" | "warning" | "error" | "info"> = {
  pending: "default",
  queued: "default",
  running: "info",
  completed: "success",
  failed: "error",
  cancelled: "default",
  needs_human: "warning",
};

const modeLabels: Record<string, string> = {
  cookbook: "Cookbook",
  magnitude: "Magnitude",
  hybrid: "Hybrid",
};

export function GhJobCard({ ghJob }: GhJobCardProps) {
  const startedAt = ghJob.timestamps.startedAt ? new Date(ghJob.timestamps.startedAt) : null;
  const completedAt = ghJob.timestamps.completedAt ? new Date(ghJob.timestamps.completedAt) : null;
  const createdAt = new Date(ghJob.timestamps.createdAt);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-[var(--wk-text-secondary)]" />
            <CardTitle className="text-lg">GhostHands Job</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {ghJob.executionMode && (
              <Badge variant="info" className="text-xs">
                <Zap className="h-3 w-3 mr-1" />
                {modeLabels[ghJob.executionMode] ?? ghJob.executionMode}
              </Badge>
            )}
            <Badge variant={statusColors[ghJob.ghStatus] ?? "default"} className="capitalize">
              {ghJob.ghStatus.replace("_", " ")}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Progress bar */}
        {ghJob.progress != null && ghJob.ghStatus === "running" && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-[var(--wk-text-secondary)]">
                {ghJob.statusMessage ?? "Processing..."}
              </span>
              <span className="text-xs font-medium">{ghJob.progress}%</span>
            </div>
            <div className="h-2 w-full rounded-full bg-[var(--wk-surface-sunken)] overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[var(--wk-copilot)] to-[var(--wk-accent-teal)] transition-all duration-500"
                style={{ width: `${ghJob.progress}%` }}
              />
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          {/* Job ID */}
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-[var(--wk-text-secondary)]">
              Job ID
            </p>
            <p className="mt-1 text-xs font-mono truncate" title={ghJob.jobId}>
              {ghJob.jobId.slice(0, 8)}...
            </p>
          </div>

          {/* Duration */}
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-[var(--wk-text-secondary)]">
              <Clock className="h-3 w-3 inline mr-1" />
              Duration
            </p>
            <p className="mt-1 text-sm">
              {completedAt && startedAt
                ? formatDistanceStrict(completedAt, startedAt)
                : startedAt
                  ? formatDistanceStrict(new Date(), startedAt) + " (running)"
                  : formatDistanceStrict(new Date(), createdAt) + " (waiting)"}
            </p>
          </div>

          {/* Cost */}
          {ghJob.cost && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-[var(--wk-text-secondary)]">
                <DollarSign className="h-3 w-3 inline mr-1" />
                Cost
              </p>
              <p className="mt-1 text-sm">
                ${ghJob.cost.totalCostUsd.toFixed(4)}
                <span className="text-xs text-[var(--wk-text-tertiary)] ml-1">
                  ({ghJob.cost.actionCount} actions)
                </span>
              </p>
            </div>
          )}

          {/* Worker */}
          {ghJob.targetWorkerId && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-[var(--wk-text-secondary)]">
                Worker
              </p>
              <p className="mt-1 text-xs font-mono truncate" title={ghJob.targetWorkerId}>
                {ghJob.targetWorkerId.slice(0, 8)}...
              </p>
            </div>
          )}
        </div>

        {/* Error details */}
        {ghJob.error && (
          <div className="rounded-[var(--wk-radius-md)] bg-red-50 dark:bg-red-950/20 p-3 border border-red-200 dark:border-red-800">
            <p className="text-xs font-medium text-[var(--wk-status-error)]">{ghJob.error.code}</p>
            <p className="text-xs text-[var(--wk-text-secondary)] mt-1">{ghJob.error.message}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
