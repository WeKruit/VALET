import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@valet/ui/components/card";
import { Badge } from "@valet/ui/components/badge";
import { Button } from "@valet/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@valet/ui/components/dialog";
import { Skeleton } from "@valet/ui/components/skeleton";
import { Cpu, AlertCircle, RefreshCw, Activity, XCircle, ServerOff, Pause } from "lucide-react";
import { toast } from "sonner";
import { useWorkerFleet, useDeregisterWorker } from "../hooks/use-workers";
import type { WorkerEntry } from "../hooks/use-workers";

const statusVariant: Record<string, "success" | "warning" | "error" | "default"> = {
  active: "success",
  draining: "warning",
  offline: "error",
};

function formatUptime(seconds: number | null): string {
  if (seconds == null) return "\u2014";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

type StatusFilter = "all" | "active" | "draining" | "offline";

export function WorkersPage() {
  const { data, isLoading, isError, refetch } = useWorkerFleet();
  const deregisterWorker = useDeregisterWorker();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [deregisterTarget, setDeregisterTarget] = useState<WorkerEntry | null>(null);
  const workers = data?.workers ?? [];
  const filtered =
    statusFilter === "all" ? workers : workers.filter((w) => w.status === statusFilter);
  const activeCount = workers.filter((w) => w.status === "active").length;
  const drainingCount = workers.filter((w) => w.status === "draining").length;
  const offlineCount = workers.filter((w) => w.status === "offline").length;

  const handleDeregister = async () => {
    if (!deregisterTarget) return;
    try {
      await deregisterWorker.mutateAsync({
        workerId: deregisterTarget.worker_id,
        reason: "admin_deregister",
        cancelActiveJobs: true,
      });
      toast.success("Worker deregistered.");
      setDeregisterTarget(null);
    } catch {
      toast.error("Failed to deregister worker.");
    }
  };

  if (isLoading)
    return (
      <div className="space-y-6 p-6">
        <h1 className="text-2xl font-bold">Workers</h1>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-[var(--wk-radius-lg)]" />
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-[var(--wk-radius-lg)]" />
      </div>
    );

  if (isError)
    return (
      <div className="space-y-6 p-6">
        <h1 className="text-2xl font-bold">Workers</h1>
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <AlertCircle className="mx-auto h-8 w-8 text-[var(--wk-status-error)]" />
            <p className="text-sm text-[var(--wk-text-secondary)]">
              Failed to load worker fleet data.
            </p>
            <Button variant="secondary" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" />
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Workers</h1>
        <Button variant="secondary" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-[var(--wk-text-secondary)]">
              Total Workers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Cpu className="h-5 w-5 text-[var(--wk-text-tertiary)]" />
              <span className="text-2xl font-bold tabular-nums">{workers.length}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-[var(--wk-text-secondary)]">
              Active
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-[var(--wk-status-success)]" />
              <span className="text-2xl font-bold tabular-nums">{activeCount}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-[var(--wk-text-secondary)]">
              Offline
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <ServerOff className="h-5 w-5 text-[var(--wk-status-error)]" />
              <span className="text-2xl font-bold tabular-nums">{offlineCount}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-[var(--wk-text-secondary)]">
              Draining
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Pause className="h-5 w-5 text-[var(--wk-status-warning)]" />
              <span className="text-2xl font-bold tabular-nums">{drainingCount}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-2">
        {(["all", "active", "draining", "offline"] as const).map((f) => (
          <Button
            key={f}
            variant={statusFilter === f ? "primary" : "secondary"}
            size="sm"
            onClick={() => setStatusFilter(f)}
            className="capitalize"
          >
            {f === "all"
              ? `All (${workers.length})`
              : `${f} (${workers.filter((w) => w.status === f).length})`}
          </Button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="py-12 text-center">
              <Cpu className="mx-auto h-8 w-8 text-[var(--wk-text-tertiary)]" />
              <p className="mt-2 text-sm text-[var(--wk-text-secondary)]">
                {statusFilter === "all" ? "No workers registered." : `No ${statusFilter} workers.`}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--wk-border-subtle)]">
                    <th className="px-4 py-3 text-left font-medium text-[var(--wk-text-secondary)]">
                      Worker ID
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-[var(--wk-text-secondary)]">
                      Sandbox
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-[var(--wk-text-secondary)]">
                      IP Address
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-[var(--wk-text-secondary)]">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-[var(--wk-text-secondary)]">
                      Current Job
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-[var(--wk-text-secondary)]">
                      Jobs
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-[var(--wk-text-secondary)]">
                      Uptime
                    </th>
                    <th className="px-4 py-3 text-right font-medium text-[var(--wk-text-secondary)]">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--wk-border-subtle)]">
                  {filtered.map((w) => (
                    <tr
                      key={w.worker_id}
                      className="hover:bg-[var(--wk-surface-raised)] transition-colors"
                    >
                      <td className="px-4 py-3 font-mono text-xs">{w.worker_id.slice(0, 8)}...</td>
                      <td className="px-4 py-3 text-xs text-[var(--wk-text-secondary)]">
                        {w.sandbox_name ?? "\u2014"}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-[var(--wk-text-secondary)]">
                        {w.ec2_ip ?? "\u2014"}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={statusVariant[w.status] ?? "default"}
                          className="capitalize"
                        >
                          {w.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-[var(--wk-text-secondary)]">
                        {w.current_job_id ? `${w.current_job_id.slice(0, 8)}...` : "\u2014"}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-xs">
                        <span className="text-[var(--wk-status-success)]">{w.jobs_completed}</span>
                        {" / "}
                        <span className="text-[var(--wk-status-error)]">{w.jobs_failed}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-[var(--wk-text-secondary)]">
                        {formatUptime(w.uptime_seconds)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => setDeregisterTarget(w)}
                          title="Deregister worker"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!deregisterTarget} onOpenChange={(open) => !open && setDeregisterTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deregister Worker</DialogTitle>
            <DialogDescription>
              Are you sure you want to deregister this worker? Active jobs will be cancelled.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDeregisterTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deregisterWorker.isPending}
              onClick={handleDeregister}
            >
              {deregisterWorker.isPending ? "Deregistering..." : "Deregister"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
