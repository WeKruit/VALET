import { Badge } from "@valet/ui/components/badge";
import { Button } from "@valet/ui/components/button";
import { Skeleton } from "@valet/ui/components/skeleton";
import { Users, AlertCircle, RefreshCw } from "lucide-react";
import { useAgentWorkers } from "../hooks/use-sandboxes";

const statusVariant: Record<string, "success" | "warning" | "error" | "default" | "info"> = {
  running: "success",
  idle: "info",
  busy: "warning",
  draining: "warning",
  stopped: "default",
};

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

interface SandboxWorkersTabProps {
  sandboxId: string;
}

export function SandboxWorkersTab({ sandboxId }: SandboxWorkersTabProps) {
  const { data, isLoading, isError, refetch } = useAgentWorkers(sandboxId);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (isError || (data && data.status !== 200)) {
    return (
      <div className="py-8 text-center space-y-3">
        <AlertCircle className="mx-auto h-8 w-8 text-[var(--wk-status-error)]" />
        <p className="text-sm text-[var(--wk-text-secondary)]">
          Agent unreachable. The sandbox may be stopped or the agent is not running.
        </p>
        <Button variant="secondary" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4" />
          Retry
        </Button>
      </div>
    );
  }

  const workers = data?.status === 200 ? data.body.data : [];

  if (workers.length === 0) {
    return (
      <div className="py-8 text-center">
        <Users className="mx-auto h-8 w-8 text-[var(--wk-text-tertiary)]" />
        <p className="mt-2 text-sm text-[var(--wk-text-secondary)]">
          No workers found on this sandbox.
        </p>
        <Button
          variant="secondary"
          size="sm"
          className="mt-3"
          disabled
          title="Coming in a future release"
        >
          Start New Worker
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--wk-border-subtle)]">
              <th className="pb-2 pr-4 text-left font-medium text-[var(--wk-text-secondary)]">
                Worker ID
              </th>
              <th className="pb-2 pr-4 text-left font-medium text-[var(--wk-text-secondary)]">
                Container
              </th>
              <th className="pb-2 pr-4 text-left font-medium text-[var(--wk-text-secondary)]">
                Status
              </th>
              <th className="pb-2 pr-4 text-left font-medium text-[var(--wk-text-secondary)]">
                Active Jobs
              </th>
              <th className="pb-2 text-left font-medium text-[var(--wk-text-secondary)]">Uptime</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--wk-border-subtle)]">
            {workers.map((w) => (
              <tr
                key={w.workerId}
                className="hover:bg-[var(--wk-surface-raised)] transition-colors"
              >
                <td className="py-2.5 pr-4 font-mono text-xs">{w.workerId}</td>
                <td className="py-2.5 pr-4 font-mono text-xs text-[var(--wk-text-secondary)]">
                  {w.containerName}
                </td>
                <td className="py-2.5 pr-4">
                  <Badge variant={statusVariant[w.status] ?? "default"} className="capitalize">
                    {w.status}
                  </Badge>
                </td>
                <td className="py-2.5 pr-4 tabular-nums">{w.activeJobs}</td>
                <td className="py-2.5 text-[var(--wk-text-secondary)]">{formatUptime(w.uptime)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end">
        <Button variant="secondary" size="sm" disabled title="Coming in a future release">
          Start New Worker
        </Button>
      </div>
    </div>
  );
}
