import { Card, CardContent, CardHeader, CardTitle } from "@valet/ui/components/card";
import { Badge } from "@valet/ui/components/badge";
import { Button } from "@valet/ui/components/button";
import { CheckCircle, XCircle, AlertTriangle, Activity, RefreshCw } from "lucide-react";
import { LoadingSpinner } from "@/components/common/loading-spinner";
import { useDeepHealthCheck } from "../hooks/use-sandboxes";
import { formatRelativeTime } from "@/lib/utils";

interface DeepHealthCardProps {
  sandboxId: string;
  ec2Running: boolean;
}

const overallVariants = {
  healthy: "success" as const,
  degraded: "warning" as const,
  unhealthy: "error" as const,
};

const portStatusIcon = {
  up: <CheckCircle className="h-4 w-4 text-[var(--wk-status-success)]" />,
  down: <XCircle className="h-4 w-4 text-[var(--wk-status-error)]" />,
  timeout: <AlertTriangle className="h-4 w-4 text-[var(--wk-status-warning)]" />,
};

const portStatusColor = {
  up: "text-[var(--wk-status-success)]",
  down: "text-[var(--wk-status-error)]",
  timeout: "text-[var(--wk-status-warning)]",
};

export function DeepHealthCard({ sandboxId, ec2Running }: DeepHealthCardProps) {
  const { data, isLoading, isError, refetch, isFetching } = useDeepHealthCheck(
    sandboxId,
    ec2Running,
  );
  const result = data?.status === 200 ? data.body : null;

  if (!ec2Running) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Deep Health Check
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[var(--wk-text-tertiary)]">
            Instance is not running. Start it to run deep health checks.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Deep Health Check
            {result && (
              <Badge variant={overallVariants[result.overall]} className="text-xs capitalize">
                {result.overall}
              </Badge>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            {isFetching ? <LoadingSpinner size="sm" /> : <RefreshCw className="h-4 w-4" />}
            {isFetching ? "Checking..." : "Run Check"}
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading && !result ? (
          <div className="flex items-center justify-center py-6">
            <LoadingSpinner size="lg" />
          </div>
        ) : isError && !result ? (
          <p className="text-sm text-[var(--wk-text-tertiary)]">
            Unable to run deep health check. The sandbox may be unreachable.
          </p>
        ) : result ? (
          <div className="space-y-4">
            {result.checks.length === 0 ? (
              <p className="text-sm text-[var(--wk-text-tertiary)] text-center py-4">
                No port checks returned. The instance may still be starting up.
              </p>
            ) : (
              /* Per-port status table */
              <div className="overflow-hidden rounded-[var(--wk-radius-lg)] border border-[var(--wk-border-subtle)]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--wk-border-subtle)] bg-[var(--wk-surface-sunken)]">
                      <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-[var(--wk-text-secondary)]">
                        Service
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-[var(--wk-text-secondary)]">
                        Port
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-[var(--wk-text-secondary)]">
                        Status
                      </th>
                      <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wider text-[var(--wk-text-secondary)]">
                        Response
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.checks.map((check) => (
                      <tr
                        key={check.name}
                        className="border-b border-[var(--wk-border-subtle)] last:border-0"
                      >
                        <td className="px-4 py-2.5 font-medium text-[var(--wk-text-primary)]">
                          {check.name}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-[var(--wk-text-secondary)]">
                          {check.port}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1.5">
                            {portStatusIcon[check.status]}
                            <span className={`capitalize ${portStatusColor[check.status]}`}>
                              {check.status}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-[var(--wk-text-secondary)]">
                          {check.status === "timeout"
                            ? "timeout"
                            : check.status === "down" && check.responseTimeMs === 0
                              ? "-"
                              : `${check.responseTimeMs}ms`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Last check timestamp */}
            <p className="text-xs text-[var(--wk-text-tertiary)]">
              Last checked {formatRelativeTime(new Date(result.timestamp).toISOString())}
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
