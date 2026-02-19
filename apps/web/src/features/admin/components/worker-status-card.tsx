import { Card, CardContent, CardHeader, CardTitle } from "@valet/ui/components/card";
import { Badge } from "@valet/ui/components/badge";
import { Activity, Server, Clock, CheckCircle, XCircle, Container, Zap, Inbox } from "lucide-react";
import { LoadingSpinner } from "@/components/common/loading-spinner";
import { useWorkerStatus } from "../hooks/use-sandboxes";

interface WorkerStatusCardProps {
  sandboxId: string;
  ec2Running: boolean;
}

function StatusDot({ status }: { status: "healthy" | "degraded" | "unhealthy" | "unreachable" }) {
  const colors = {
    healthy: "bg-[var(--wk-status-success)]",
    degraded: "bg-[var(--wk-status-warning)]",
    unhealthy: "bg-[var(--wk-status-error)]",
    unreachable: "bg-[var(--wk-text-tertiary)]",
  };
  return <span className={`inline-block h-2 w-2 rounded-full ${colors[status]}`} />;
}

function TaskStatusBadge({ status }: { status: string }) {
  const variant =
    status === "completed"
      ? ("success" as const)
      : status === "failed" || status === "cancelled"
        ? ("error" as const)
        : ("secondary" as const);

  return (
    <Badge variant={variant} className="text-xs">
      {status}
    </Badge>
  );
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function OverallStatusBadge({
  status,
}: {
  status: "healthy" | "degraded" | "unhealthy" | "unreachable";
}) {
  const variants = {
    healthy: "success" as const,
    degraded: "warning" as const,
    unhealthy: "error" as const,
    unreachable: "secondary" as const,
  };
  return (
    <Badge variant={variants[status]} className="text-xs capitalize">
      {status}
    </Badge>
  );
}

export function WorkerStatusCard({ sandboxId, ec2Running }: WorkerStatusCardProps) {
  const { data, isLoading, isError } = useWorkerStatus(sandboxId, ec2Running);
  const ws = data?.status === 200 ? data.body : null;

  if (!ec2Running) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Worker Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[var(--wk-text-tertiary)]">
            EC2 instance is not running. Start the instance to see worker status.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading && !data) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Worker Status
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-6">
          <LoadingSpinner size="lg" />
        </CardContent>
      </Card>
    );
  }

  if (isError && !ws) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Worker Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[var(--wk-text-tertiary)]">
            Unable to fetch worker status. The API may be unreachable.
          </p>
        </CardContent>
      </Card>
    );
  }

  const containerCount = ws?.dockerContainers ?? 0;
  const containersHealthy = containerCount > 0;
  const activeJobs = ws?.worker.activeJobs ?? 0;
  const maxConcurrent = ws?.worker.maxConcurrent ?? 0;
  const queueDepth = ws?.worker.queueDepth ?? 0;
  const totalProcessed = ws?.worker.totalProcessed ?? 0;
  const hasActiveJobs = activeJobs > 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Worker Status
          {ws && <OverallStatusBadge status={ws.worker.status} />}
          {ws?.uptime != null && (
            <span className="ml-auto text-xs font-normal text-[var(--wk-text-tertiary)]">
              Uptime: {formatUptime(ws.uptime)}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* ── Infrastructure ── */}
        <div className="space-y-3">
          <h4 className="text-xs font-medium uppercase tracking-wider text-[var(--wk-text-secondary)]">
            Infrastructure
          </h4>

          <div className="grid grid-cols-4 gap-3">
            {/* Docker Containers */}
            <div className="rounded-[var(--wk-radius-lg)] border border-[var(--wk-border-subtle)] p-3 text-center">
              <div
                className={`mx-auto flex h-8 w-8 items-center justify-center rounded-[var(--wk-radius-md)] mb-1.5 ${
                  containersHealthy
                    ? "bg-[color-mix(in_srgb,var(--wk-status-success)_12%,transparent)]"
                    : "bg-[var(--wk-surface-sunken)]"
                }`}
              >
                <Container
                  className={`h-4 w-4 ${containersHealthy ? "text-[var(--wk-status-success)]" : "text-[var(--wk-text-tertiary)]"}`}
                />
              </div>
              <p
                className={`text-xl font-semibold ${containersHealthy ? "text-[var(--wk-text-primary)]" : "text-[var(--wk-text-tertiary)]"}`}
              >
                {containerCount}
              </p>
              <p className="text-xs text-[var(--wk-text-tertiary)]">Containers</p>
            </div>

            {/* Active Jobs */}
            <div className="rounded-[var(--wk-radius-lg)] border border-[var(--wk-border-subtle)] p-3 text-center">
              <div
                className={`mx-auto flex h-8 w-8 items-center justify-center rounded-[var(--wk-radius-md)] mb-1.5 ${
                  hasActiveJobs
                    ? "bg-[color-mix(in_srgb,var(--wk-copilot)_12%,transparent)]"
                    : "bg-[var(--wk-surface-sunken)]"
                }`}
              >
                <Zap
                  className={`h-4 w-4 ${hasActiveJobs ? "text-[var(--wk-copilot)]" : "text-[var(--wk-text-tertiary)]"}`}
                />
              </div>
              <p
                className={`text-xl font-semibold ${hasActiveJobs ? "text-[var(--wk-copilot)]" : "text-[var(--wk-text-primary)]"}`}
              >
                {activeJobs}
                {maxConcurrent > 0 && (
                  <span className="text-sm font-normal text-[var(--wk-text-tertiary)]">
                    /{maxConcurrent}
                  </span>
                )}
              </p>
              <p className="text-xs text-[var(--wk-text-tertiary)]">Active Jobs</p>
            </div>

            {/* GhostHands API */}
            <div className="rounded-[var(--wk-radius-lg)] border border-[var(--wk-border-subtle)] p-3 text-center">
              <div
                className={`mx-auto flex h-8 w-8 items-center justify-center rounded-[var(--wk-radius-md)] mb-1.5 ${
                  ws?.ghosthandsApi.status === "healthy"
                    ? "bg-[color-mix(in_srgb,var(--wk-status-success)_12%,transparent)]"
                    : "bg-[var(--wk-surface-sunken)]"
                }`}
              >
                <Server
                  className={`h-4 w-4 ${ws?.ghosthandsApi.status === "healthy" ? "text-[var(--wk-status-success)]" : "text-[var(--wk-text-tertiary)]"}`}
                />
              </div>
              <div className="flex items-center justify-center gap-1.5">
                <StatusDot status={ws?.ghosthandsApi.status ?? "unreachable"} />
                <span className="text-sm font-medium capitalize">
                  {ws?.ghosthandsApi.status ?? "N/A"}
                </span>
              </div>
              <p className="text-xs text-[var(--wk-text-tertiary)]">
                GH API
                {ws?.ghosthandsApi.version && <span> v{ws.ghosthandsApi.version}</span>}
              </p>
            </div>

            {/* Queue Depth */}
            <div className="rounded-[var(--wk-radius-lg)] border border-[var(--wk-border-subtle)] p-3 text-center">
              <div
                className={`mx-auto flex h-8 w-8 items-center justify-center rounded-[var(--wk-radius-md)] mb-1.5 ${
                  queueDepth > 0
                    ? "bg-[color-mix(in_srgb,var(--wk-status-warning)_12%,transparent)]"
                    : "bg-[var(--wk-surface-sunken)]"
                }`}
              >
                <Inbox
                  className={`h-4 w-4 ${queueDepth > 0 ? "text-[var(--wk-status-warning)]" : "text-[var(--wk-text-tertiary)]"}`}
                />
              </div>
              <p className="text-xl font-semibold text-[var(--wk-text-primary)]">{queueDepth}</p>
              <p className="text-xs text-[var(--wk-text-tertiary)]">In Queue</p>
            </div>
          </div>

          {/* Health checks as compact pills */}
          {ws && ws.ghChecks.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {ws.ghChecks.map((check) => (
                <div
                  key={check.name}
                  className="inline-flex items-center gap-1.5 rounded-[var(--wk-radius-full)] border border-[var(--wk-border-subtle)] px-2.5 py-1 text-xs"
                >
                  {check.status === "healthy" ? (
                    <CheckCircle className="h-3 w-3 text-[var(--wk-status-success)]" />
                  ) : (
                    <XCircle className="h-3 w-3 text-[var(--wk-status-error)]" />
                  )}
                  <span className="capitalize text-[var(--wk-text-secondary)]">
                    {check.name.replace(/_/g, " ")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Job Activity ── */}
        <div className="space-y-3">
          <h4 className="text-xs font-medium uppercase tracking-wider text-[var(--wk-text-secondary)]">
            Job Activity
          </h4>

          {/* Idle / Active messaging */}
          {activeJobs === 0 ? (
            <div className="flex items-center gap-2 rounded-[var(--wk-radius-md)] bg-[color-mix(in_srgb,var(--wk-status-success)_8%,transparent)] px-3 py-2">
              <Zap className="h-4 w-4 text-[var(--wk-status-success)]" />
              <span className="text-sm text-[var(--wk-status-success)]">
                Ready — no jobs in progress
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-[var(--wk-radius-md)] bg-[color-mix(in_srgb,var(--wk-copilot)_8%,transparent)] px-3 py-2">
              <Activity className="h-4 w-4 text-[var(--wk-copilot)]" />
              <span className="text-sm text-[var(--wk-copilot)]">
                {activeJobs} {activeJobs === 1 ? "job" : "jobs"} processing
              </span>
            </div>
          )}

          {/* Job stats summary */}
          <div className="flex items-center justify-between text-xs text-[var(--wk-text-tertiary)]">
            <div className="flex gap-4">
              <span>
                Processed:{" "}
                <span className="font-medium text-[var(--wk-text-secondary)]">
                  {totalProcessed}
                </span>
              </span>
              {ws && ws.jobStats.completed > 0 && (
                <span>
                  Completed:{" "}
                  <span className="font-medium text-[var(--wk-status-success)]">
                    {ws.jobStats.completed}
                  </span>
                </span>
              )}
              {ws && ws.jobStats.failed > 0 && (
                <span>
                  Failed:{" "}
                  <span className="font-medium text-[var(--wk-status-error)]">
                    {ws.jobStats.failed}
                  </span>
                </span>
              )}
            </div>
            {maxConcurrent > 0 && (
              <span>
                Capacity: {activeJobs}/{maxConcurrent}
              </span>
            )}
          </div>
        </div>

        {/* ── Active Tasks ── */}
        {ws && ws.activeTasks.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-medium uppercase tracking-wider text-[var(--wk-text-secondary)]">
              Active Tasks
            </h4>
            <div className="space-y-2">
              {ws.activeTasks.map((t) => (
                <div
                  key={t.taskId}
                  className="flex items-center justify-between rounded-[var(--wk-radius-md)] border border-[var(--wk-border-subtle)] p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{t.jobUrl}</p>
                    {t.currentStep && (
                      <p className="text-xs text-[var(--wk-text-tertiary)]">{t.currentStep}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 ml-3">
                    <div className="w-20">
                      <div className="h-1.5 w-full rounded-full bg-[var(--wk-surface-sunken)] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[var(--wk-copilot)] transition-all duration-500"
                          style={{ width: `${Math.min(t.progress, 100)}%` }}
                        />
                      </div>
                      <p className="text-xs text-[var(--wk-text-tertiary)] text-right mt-0.5">
                        {t.progress}%
                      </p>
                    </div>
                    <TaskStatusBadge status={t.status} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Recent Tasks ── */}
        {ws && ws.recentTasks.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-medium uppercase tracking-wider text-[var(--wk-text-secondary)]">
              Recent Tasks
            </h4>
            <div className="space-y-1">
              {ws.recentTasks.map((t) => (
                <div key={t.taskId} className="flex items-center justify-between py-1.5 text-sm">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <Clock className="h-3.5 w-3.5 text-[var(--wk-text-tertiary)] shrink-0" />
                    <span className="truncate text-[var(--wk-text-secondary)]">{t.jobUrl}</span>
                  </div>
                  <TaskStatusBadge status={t.status} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {ws && ws.activeTasks.length === 0 && ws.recentTasks.length === 0 && (
          <p className="text-sm text-[var(--wk-text-tertiary)] text-center py-2">
            No tasks have been triggered on this sandbox yet.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
