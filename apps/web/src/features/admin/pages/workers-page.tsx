import { useMemo, useState } from "react";
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
import { Progress } from "@valet/ui/components/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@valet/ui/components/tooltip";
import { Skeleton } from "@valet/ui/components/skeleton";
import {
  Cpu,
  AlertCircle,
  RefreshCw,
  Activity,
  XCircle,
  ServerOff,
  Pause,
  Monitor,
  Droplets,
  HardDrive,
  MemoryStick,
} from "lucide-react";
import { toast } from "sonner";
import { useWorkerFleet, useDeregisterWorker } from "../hooks/use-workers";
import type { WorkerEntry } from "../hooks/use-workers";
import { useFleetSandboxMetrics, useDrainWorker } from "../hooks/use-fleet-metrics";
import { Ec2StatusBadge } from "../components/ec2-status-badge";

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

// ─── Fleet Resource Card ───

function MetricBar({
  label,
  icon: Icon,
  used,
  total,
  unit,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  used: number | null;
  total: number | null;
  unit: string;
}) {
  if (used == null || total == null || total === 0) {
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 text-[var(--wk-text-secondary)]">
            <Icon className="h-3.5 w-3.5" />
            {label}
          </span>
          <span className="text-[var(--wk-text-tertiary)]">{"\u2014"}</span>
        </div>
        <Progress value={0} className="h-1.5" />
      </div>
    );
  }

  const pct = Math.round((used / total) * 100);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 text-[var(--wk-text-secondary)]">
          <Icon className="h-3.5 w-3.5" />
          {label}
        </span>
        <span className="tabular-nums text-[var(--wk-text-secondary)]">
          {used.toFixed(1)}/{total.toFixed(1)} {unit} ({pct}%)
        </span>
      </div>
      <Progress
        value={pct}
        className={
          pct >= 90
            ? "h-1.5 [&>div]:bg-[var(--wk-status-error)]"
            : pct >= 70
              ? "h-1.5 [&>div]:bg-[var(--wk-status-warning)]"
              : "h-1.5 [&>div]:bg-[var(--wk-status-success)]"
        }
      />
    </div>
  );
}

function SandboxResourceCard({
  sandboxId,
  sandboxName,
}: {
  sandboxId: string;
  sandboxName: string;
}) {
  const { data: metrics, isLoading, isError } = useFleetSandboxMetrics(sandboxId);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{sandboxName}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
          </div>
        ) : isError ? (
          <p className="text-xs text-[var(--wk-text-tertiary)]">Metrics unavailable</p>
        ) : (
          <>
            <MetricBar label="CPU" icon={Cpu} used={metrics?.cpu ?? null} total={100} unit="%" />
            <MetricBar
              label="Memory"
              icon={MemoryStick}
              used={metrics?.memoryUsedMb != null ? metrics.memoryUsedMb / 1024 : null}
              total={metrics?.memoryTotalMb != null ? metrics.memoryTotalMb / 1024 : null}
              unit="GB"
            />
            <MetricBar
              label="Disk"
              icon={HardDrive}
              used={metrics?.diskUsedGb ?? null}
              total={metrics?.diskTotalGb ?? null}
              unit="GB"
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main Page ───

export function WorkersPage() {
  const { data, isLoading, isError, refetch } = useWorkerFleet();
  const deregisterWorker = useDeregisterWorker();
  const drainWorker = useDrainWorker();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [deregisterTarget, setDeregisterTarget] = useState<WorkerEntry | null>(null);
  const [drainTarget, setDrainTarget] = useState<WorkerEntry | null>(null);
  const workers = data?.workers ?? [];
  const filtered =
    statusFilter === "all" ? workers : workers.filter((w) => w.status === statusFilter);
  const activeCount = workers.filter((w) => w.status === "active").length;
  const drainingCount = workers.filter((w) => w.status === "draining").length;
  const offlineCount = workers.filter((w) => w.status === "offline").length;

  // Derive unique sandboxes from the worker list for fleet resource panel
  const uniqueSandboxes = useMemo(() => {
    const seen = new Map<string, { id: string; name: string }>();
    for (const w of workers) {
      if (w.sandbox_id && w.sandbox_name && !seen.has(w.sandbox_id)) {
        seen.set(w.sandbox_id, { id: w.sandbox_id, name: w.sandbox_name });
      }
    }
    return Array.from(seen.values());
  }, [workers]);

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
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to deregister worker.");
    }
  };

  const handleDrain = async () => {
    if (!drainTarget) return;
    try {
      await drainWorker.mutateAsync({ workerId: drainTarget.worker_id });
      toast.success("Worker drain initiated.");
      setDrainTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to drain worker.");
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
    <TooltipProvider>
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Workers</h1>
          <Button variant="secondary" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>

        {/* Summary Cards */}
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

        {/* Fleet Resources Panel */}
        {uniqueSandboxes.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-[var(--wk-text-secondary)]">
              Fleet Resources
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {uniqueSandboxes.map((s) => (
                <SandboxResourceCard key={s.id} sandboxId={s.id} sandboxName={s.name} />
              ))}
            </div>
          </div>
        )}

        {/* Status Filter */}
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

        {/* Workers Table */}
        <Card>
          <CardContent className="p-0">
            {filtered.length === 0 ? (
              <div className="py-12 text-center">
                <Cpu className="mx-auto h-8 w-8 text-[var(--wk-text-tertiary)]" />
                <p className="mt-2 text-sm text-[var(--wk-text-secondary)]">
                  {statusFilter === "all"
                    ? "No workers registered."
                    : `No ${statusFilter} workers.`}
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
                        EC2
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
                      <th className="px-4 py-3 text-center font-medium text-[var(--wk-text-secondary)]">
                        VNC
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
                        className={`hover:bg-[var(--wk-surface-raised)] transition-colors ${w.transitioning ? "animate-pulse" : ""}`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-xs">{w.worker_id.slice(0, 8)}...</span>
                            <span
                              className={`inline-flex items-center rounded px-1 py-0.5 text-[10px] font-medium leading-none ${
                                w.source === "atm" && !w.atm_unverified
                                  ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                                  : w.source === "atm" && w.atm_unverified
                                    ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                                    : "bg-purple-500/10 text-purple-600 dark:text-purple-400"
                              }`}
                            >
                              {w.source === "atm" && w.atm_unverified
                                ? "ATM?"
                                : w.source === "atm"
                                  ? "ATM"
                                  : "GH"}
                            </span>
                          </div>
                        </td>
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
                        <td className="px-4 py-3">
                          <Ec2StatusBadge status={w.ec2_state} />
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-[var(--wk-text-secondary)]">
                          {w.current_job_id ? (
                            <div className="flex flex-col">
                              <span>{w.current_job_id.slice(0, 8)}...</span>
                              {w.active_jobs != null && w.active_jobs > 0 && (
                                <span className="text-[10px] text-[var(--wk-text-tertiary)]">
                                  {w.active_jobs} active (ATM)
                                </span>
                              )}
                            </div>
                          ) : (
                            <div className="flex flex-col">
                              <span>{"\u2014"}</span>
                              {w.active_jobs != null && w.active_jobs > 0 && (
                                <span className="text-[10px] text-[var(--wk-text-tertiary)]">
                                  {w.active_jobs} active (ATM)
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-xs">
                          <span className="text-[var(--wk-status-success)]">
                            {w.jobs_completed}
                          </span>
                          {" / "}
                          <span className="text-[var(--wk-status-error)]">{w.jobs_failed}</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-[var(--wk-text-secondary)]">
                          {formatUptime(w.uptime_seconds)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {w.ec2_ip ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <a
                                  href={`http://${w.ec2_ip}:6901/`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center justify-center rounded-md p-1.5 text-[var(--wk-text-secondary)] hover:text-[var(--wk-text-primary)] hover:bg-[var(--wk-surface-sunken)] transition-colors"
                                >
                                  <Monitor className="h-4 w-4" />
                                </a>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Open VNC session ({w.ec2_ip}:6901)</p>
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <span className="text-[var(--wk-text-tertiary)]">{"\u2014"}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => setDrainTarget(w)}
                                  disabled={
                                    (w.source === "atm" && !w.atm_unverified) ||
                                    w.status === "draining" ||
                                    w.status === "offline"
                                  }
                                  title="Drain worker"
                                >
                                  <Droplets className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>
                                  {w.source === "atm" && !w.atm_unverified
                                    ? "Manage via ATM (Sandbox start/stop)"
                                    : w.source === "atm" && w.atm_unverified
                                      ? "ATM unreachable \u2014 ownership unverified, action may fail"
                                      : w.status === "draining"
                                        ? "Already draining"
                                        : w.status === "offline"
                                          ? "Worker offline"
                                          : "Drain worker (finish current job, reject new ones)"}
                                </p>
                              </TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => setDeregisterTarget(w)}
                                  disabled={w.source === "atm" && !w.atm_unverified}
                                  title="Deregister worker"
                                >
                                  <XCircle className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>
                                  {w.source === "atm" && !w.atm_unverified
                                    ? "Manage via ATM (Sandbox start/stop)"
                                    : w.source === "atm" && w.atm_unverified
                                      ? "ATM unreachable \u2014 ownership unverified, action may fail"
                                      : "Deregister worker (cancel active jobs)"}
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Deregister Confirmation Dialog */}
        <Dialog
          open={!!deregisterTarget}
          onOpenChange={(open) => !open && setDeregisterTarget(null)}
        >
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

        {/* Drain Confirmation Dialog */}
        <Dialog open={!!drainTarget} onOpenChange={(open) => !open && setDrainTarget(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Drain Worker</DialogTitle>
              <DialogDescription>
                This will put the worker into drain mode. It will finish its current job but will
                not accept new ones. The worker can be re-activated by restarting the container.
              </DialogDescription>
            </DialogHeader>
            {drainTarget && (
              <div className="rounded-md bg-[var(--wk-surface-sunken)] px-3 py-2 text-xs space-y-1">
                <p>
                  <span className="text-[var(--wk-text-tertiary)]">Worker:</span>{" "}
                  <span className="font-mono">{drainTarget.worker_id.slice(0, 12)}...</span>
                </p>
                {drainTarget.sandbox_name && (
                  <p>
                    <span className="text-[var(--wk-text-tertiary)]">Sandbox:</span>{" "}
                    {drainTarget.sandbox_name}
                  </p>
                )}
                {drainTarget.current_job_id && (
                  <p>
                    <span className="text-[var(--wk-text-tertiary)]">Active job:</span>{" "}
                    <span className="font-mono">{drainTarget.current_job_id.slice(0, 12)}...</span>
                  </p>
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="secondary" onClick={() => setDrainTarget(null)}>
                Cancel
              </Button>
              <Button variant="primary" disabled={drainWorker.isPending} onClick={handleDrain}>
                {drainWorker.isPending ? "Draining..." : "Drain Worker"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
