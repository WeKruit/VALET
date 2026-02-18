import { Card, CardContent, CardHeader, CardTitle } from "@valet/ui/components/card";
import { Badge } from "@valet/ui/components/badge";
import { Activity, Server, ListTodo, Clock, CheckCircle, XCircle, BarChart3 } from "lucide-react";
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

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Worker Status
          {ws?.ghosthandsApi.version && (
            <span className="text-xs font-normal text-[var(--wk-text-tertiary)]">
              v{ws.ghosthandsApi.version}
            </span>
          )}
          {ws?.uptime != null && (
            <span className="ml-auto text-xs font-normal text-[var(--wk-text-tertiary)]">
              Uptime: {formatUptime(ws.uptime)}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Service Status Row */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div className="rounded-[var(--wk-radius-md)] border border-[var(--wk-border-subtle)] p-3 space-y-1">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-[var(--wk-text-secondary)]">
              <Server className="h-3.5 w-3.5" />
              GhostHands API
            </div>
            <div className="flex items-center gap-2">
              <StatusDot status={ws?.ghosthandsApi.status ?? "unreachable"} />
              <span className="text-sm font-medium capitalize">
                {ws?.ghosthandsApi.status ?? "unknown"}
              </span>
            </div>
          </div>

          <div className="rounded-[var(--wk-radius-md)] border border-[var(--wk-border-subtle)] p-3 space-y-1">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-[var(--wk-text-secondary)]">
              <Activity className="h-3.5 w-3.5" />
              Active Jobs
            </div>
            <div className="flex items-center gap-2">
              <StatusDot status={ws?.worker.status ?? "unreachable"} />
              <span className="text-sm font-medium">{ws?.worker.activeJobs ?? 0}</span>
              {ws?.worker.maxConcurrent != null && (
                <span className="text-xs text-[var(--wk-text-tertiary)]">
                  / {ws.worker.maxConcurrent} max
                </span>
              )}
            </div>
          </div>

          <div className="rounded-[var(--wk-radius-md)] border border-[var(--wk-border-subtle)] p-3 space-y-1">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-[var(--wk-text-secondary)]">
              <ListTodo className="h-3.5 w-3.5" />
              Queue
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{ws?.worker.queueDepth ?? 0}</span>
            </div>
          </div>

          <div className="rounded-[var(--wk-radius-md)] border border-[var(--wk-border-subtle)] p-3 space-y-1">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-[var(--wk-text-secondary)]">
              <BarChart3 className="h-3.5 w-3.5" />
              Processed
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{ws?.worker.totalProcessed ?? 0}</span>
            </div>
          </div>
        </div>

        {/* Health Checks */}
        {ws && ws.ghChecks.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-medium uppercase tracking-wider text-[var(--wk-text-secondary)]">
              Health Checks
            </h4>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {ws.ghChecks.map((check) => (
                <div
                  key={check.name}
                  className="flex items-center gap-2 rounded-[var(--wk-radius-md)] border border-[var(--wk-border-subtle)] px-3 py-2"
                >
                  {check.status === "healthy" ? (
                    <CheckCircle className="h-3.5 w-3.5 text-[var(--wk-status-success)] shrink-0" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 text-[var(--wk-status-error)] shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-medium capitalize truncate">
                      {check.name.replace(/_/g, " ")}
                    </p>
                    {check.message && (
                      <p className="text-xs text-[var(--wk-text-tertiary)] truncate">
                        {check.message}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Job Stats */}
        {ws && (ws.jobStats.created > 0 || ws.jobStats.completed > 0 || ws.jobStats.failed > 0) && (
          <div className="space-y-2">
            <h4 className="text-xs font-medium uppercase tracking-wider text-[var(--wk-text-secondary)]">
              Job Stats (since restart)
            </h4>
            <div className="flex gap-4 text-sm">
              <span className="text-[var(--wk-text-secondary)]">
                Created:{" "}
                <span className="font-medium text-[var(--wk-text-primary)]">
                  {ws.jobStats.created}
                </span>
              </span>
              <span className="text-[var(--wk-text-secondary)]">
                Completed:{" "}
                <span className="font-medium text-[var(--wk-status-success)]">
                  {ws.jobStats.completed}
                </span>
              </span>
              <span className="text-[var(--wk-text-secondary)]">
                Failed:{" "}
                <span className="font-medium text-[var(--wk-status-error)]">
                  {ws.jobStats.failed}
                </span>
              </span>
            </div>
          </div>
        )}

        {/* Active Tasks */}
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

        {/* Recent Tasks */}
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
