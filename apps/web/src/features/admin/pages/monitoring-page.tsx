import { Card, CardContent, CardHeader, CardTitle } from "@valet/ui/components/card";
import { Badge } from "@valet/ui/components/badge";
import { Skeleton } from "@valet/ui/components/skeleton";
import { Activity, AlertTriangle, HeartPulse, Server, DollarSign } from "lucide-react";
import { useGhHealth, useGhMetrics, useGhAlerts } from "../hooks/use-monitoring";
import type { HealthCheck, MonitoringAlert } from "../hooks/use-monitoring";

const statusVariant: Record<string, "success" | "warning" | "error"> = {
  healthy: "success",
  degraded: "warning",
  unhealthy: "error",
};

const severityVariant: Record<string, "error" | "warning" | "info"> = {
  critical: "error",
  warning: "warning",
  info: "info",
};

function HealthCard() {
  const { data, isLoading, isError } = useGhHealth();

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <HeartPulse className="h-4 w-4" />
            Health Status
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <HeartPulse className="h-4 w-4" />
            Health Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[var(--wk-status-error)]">Failed to load health data.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <HeartPulse className="h-4 w-4" />
          Health Status
          <Badge variant={statusVariant[data.status] ?? "error"} className="ml-auto capitalize">
            {data.status}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="divide-y divide-[var(--wk-border-subtle)]">
          {(data.checks ?? []).map((check: HealthCheck) => (
            <div key={check.name} className="flex items-center justify-between py-2">
              <div className="flex items-center gap-2">
                <Server className="h-3.5 w-3.5 text-[var(--wk-text-tertiary)]" />
                <span className="text-sm text-[var(--wk-text-primary)] capitalize">
                  {check.name.replace(/_/g, " ")}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {check.message && (
                  <span className="text-xs text-[var(--wk-text-tertiary)] max-w-[200px] truncate">
                    {check.message}
                  </span>
                )}
                {check.latencyMs != null && (
                  <span className="text-xs text-[var(--wk-text-tertiary)]">
                    {check.latencyMs}ms
                  </span>
                )}
                <Badge variant={statusVariant[check.status] ?? "error"} className="capitalize">
                  {check.status}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function MetricsCard() {
  const { data, isLoading, isError } = useGhMetrics();

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Job Metrics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Job Metrics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[var(--wk-status-error)]">Failed to load metrics.</p>
        </CardContent>
      </Card>
    );
  }

  const stats = [
    { label: "Created", value: data.jobs?.created ?? 0 },
    { label: "Completed", value: data.jobs?.completed ?? 0 },
    { label: "Failed", value: data.jobs?.failed ?? 0 },
    { label: "Active", value: data.worker?.activeJobs ?? 0 },
    { label: "Queue Depth", value: data.worker?.queueDepth ?? 0 },
    {
      label: "Avg Duration",
      value:
        data.jobs?.avgDurationMs != null ? `${(data.jobs.avgDurationMs / 1000).toFixed(1)}s` : "--",
    },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="h-4 w-4" />
          Job Metrics
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-[var(--wk-radius-lg)] border border-[var(--wk-border-subtle)] bg-[var(--wk-surface-raised)] px-3 py-2.5"
            >
              <p className="text-xs text-[var(--wk-text-tertiary)]">{stat.label}</p>
              <p className="mt-0.5 text-lg font-semibold text-[var(--wk-text-primary)]">
                {typeof stat.value === "number" ? stat.value.toLocaleString() : stat.value}
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function AlertsCard() {
  const { data, isLoading, isError } = useGhAlerts();

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Active Alerts
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Active Alerts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[var(--wk-status-error)]">Failed to load alerts.</p>
        </CardContent>
      </Card>
    );
  }

  const alerts = data.alerts ?? [];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          Active Alerts
          {alerts.length > 0 && (
            <Badge variant="error" className="ml-1">
              {alerts.length}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {alerts.length === 0 ? (
          <p className="text-sm text-[var(--wk-text-tertiary)] py-4 text-center">
            No active alerts
          </p>
        ) : (
          <div className="space-y-2">
            {alerts.map((alert: MonitoringAlert) => (
              <div
                key={alert.id}
                className="flex items-start gap-2 rounded-[var(--wk-radius-lg)] border border-[var(--wk-border-subtle)] bg-[var(--wk-surface-raised)] px-3 py-2"
              >
                <Badge
                  variant={severityVariant[alert.severity] ?? "info"}
                  className="shrink-0 mt-0.5 capitalize"
                >
                  {alert.severity}
                </Badge>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-[var(--wk-text-primary)]">{alert.message}</p>
                  {alert.affectedJobIds && alert.affectedJobIds.length > 0 && (
                    <p className="text-xs text-[var(--wk-text-tertiary)] mt-0.5 font-mono">
                      Jobs: {alert.affectedJobIds.map((id) => id.slice(0, 8)).join(", ")}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CostCard() {
  const { data, isLoading } = useGhMetrics();

  const totalCost = data?.llm?.totalCostUsd;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <DollarSign className="h-4 w-4" />
          Cost Summary
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-10 w-32" />
        ) : totalCost != null ? (
          <div>
            <p className="text-xs text-[var(--wk-text-tertiary)]">Total Cost</p>
            <p className="mt-0.5 text-2xl font-semibold text-[var(--wk-text-primary)]">
              ${Number(totalCost).toFixed(4)}
            </p>
          </div>
        ) : (
          <p className="text-sm text-[var(--wk-text-tertiary)] py-4 text-center">
            No cost data available
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function MonitoringPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-display font-semibold text-[var(--wk-text-primary)]">
          Monitoring Dashboard
        </h1>
        <p className="mt-1 text-sm text-[var(--wk-text-secondary)]">
          GhostHands system health, metrics, and alerts. Auto-refreshes every 30 seconds.
        </p>
      </div>

      {/* Cards grid */}
      <div className="grid gap-6 md:grid-cols-2">
        <HealthCard />
        <MetricsCard />
        <AlertsCard />
        <CostCard />
      </div>
    </div>
  );
}
