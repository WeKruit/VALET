import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@valet/ui/components/card";
import { Button } from "@valet/ui/components/button";
import { Switch } from "@valet/ui/components/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@valet/ui/components/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@valet/ui/components/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@valet/ui/components/tooltip";
import {
  ArrowLeft,
  Server,
  HeartPulse,
  RefreshCw,
  Trash2,
  ExternalLink,
  Cpu,
  HardDrive,
  MemoryStick,
  Monitor,
  Wifi,
  Play,
  Square,
  Power,
} from "lucide-react";
import { toast } from "sonner";
import { formatRelativeTime } from "@/lib/utils";
import { LoadingSpinner } from "@/components/common/loading-spinner";
import { SandboxStatusBadge } from "../components/sandbox-status-badge";
import { SandboxHealthIndicator } from "../components/sandbox-health-indicator";
import { SandboxMetrics } from "../components/sandbox-metrics";
import { Ec2StatusBadge } from "../components/ec2-status-badge";
import { SandboxConnectionInfo } from "../components/sandbox-connection-info";
import { LiveView } from "@/features/tasks/components/live-view";
import {
  useSandbox,
  useSandboxMetrics,
  useDeleteSandbox,
  useHealthCheckSandbox,
  useRestartSandbox,
  useEc2Status,
  useStartSandbox,
  useStopSandbox,
  useUpdateSandbox,
} from "../hooks/use-sandboxes";
import type { SandboxEnvironment } from "../types";

const envLabels: Record<SandboxEnvironment, string> = {
  dev: "Development",
  staging: "Staging",
  prod: "Production",
};

export function SandboxDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [showLiveView, setShowLiveView] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [stopOpen, setStopOpen] = useState(false);

  const sandboxQuery = useSandbox(id ?? "");
  const metricsQuery = useSandboxMetrics(id ?? "");
  const ec2StatusQuery = useEc2Status(id ?? "");
  const deleteMutation = useDeleteSandbox();
  const healthCheckMutation = useHealthCheckSandbox();
  const restartMutation = useRestartSandbox();
  const startMutation = useStartSandbox();
  const stopMutation = useStopSandbox();
  const updateMutation = useUpdateSandbox();

  const sandbox =
    sandboxQuery.data?.status === 200 ? sandboxQuery.data.body : null;
  const metrics =
    metricsQuery.data?.status === 200 ? metricsQuery.data.body : null;
  const ec2Status =
    ec2StatusQuery.data?.status === 200
      ? ec2StatusQuery.data.body.ec2Status
      : sandbox?.ec2Status ?? null;

  if (!id) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon">
            <Link to="/admin/sandboxes">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            Sandbox Not Found
          </h1>
        </div>
      </div>
    );
  }

  if (sandboxQuery.isLoading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (sandboxQuery.isError || !sandbox) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon">
            <Link to="/admin/sandboxes">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            Sandbox Not Found
          </h1>
        </div>
        <Card>
          <CardContent className="py-8 text-center text-sm text-[var(--wk-status-error)]">
            Failed to load sandbox details. The sandbox may have been deleted.
          </CardContent>
        </Card>
      </div>
    );
  }

  function handleDelete() {
    deleteMutation.mutate(
      { params: { id: id! }, body: {} },
      {
        onSuccess: () => {
          toast.success("Sandbox terminated.");
          navigate("/admin/sandboxes");
        },
        onError: () => {
          toast.error("Failed to terminate sandbox.");
        },
      },
    );
  }

  function handleHealthCheck() {
    healthCheckMutation.mutate(
      { params: { id: id! }, body: {} },
      {
        onSuccess: () => {
          toast.success("Health check completed.");
          sandboxQuery.refetch();
        },
        onError: () => {
          toast.error("Health check failed.");
        },
      },
    );
  }

  function handleRestart() {
    restartMutation.mutate(
      { params: { id: id! }, body: {} },
      {
        onSuccess: () => {
          toast.success("Restart command sent.");
        },
        onError: () => {
          toast.error("Failed to restart service.");
        },
      },
    );
  }

  function handleStart() {
    startMutation.mutate(
      { params: { id: id! }, body: {} },
      {
        onSuccess: () => {
          toast.success("Starting EC2 instance...");
        },
        onError: () => {
          toast.error("Failed to start instance.");
        },
      },
    );
  }

  function handleStop() {
    stopMutation.mutate(
      { params: { id: id! }, body: {} },
      {
        onSuccess: () => {
          toast.success("Stopping EC2 instance...");
          setStopOpen(false);
        },
        onError: () => {
          toast.error("Failed to stop instance.");
        },
      },
    );
  }

  function handleAutoStopToggle(checked: boolean) {
    updateMutation.mutate(
      {
        params: { id: id! },
        body: { autoStopEnabled: checked },
      },
      {
        onSuccess: () => {
          toast.success(checked ? "Auto-stop enabled." : "Auto-stop disabled.");
          sandboxQuery.refetch();
        },
        onError: () => {
          toast.error("Failed to update auto-stop setting.");
        },
      },
    );
  }

  function handleIdleMinutesChange(value: string) {
    updateMutation.mutate(
      {
        params: { id: id! },
        body: { idleMinutesBeforeStop: Number(value) },
      },
      {
        onSuccess: () => {
          toast.success("Idle timeout updated.");
          sandboxQuery.refetch();
        },
        onError: () => {
          toast.error("Failed to update idle timeout.");
        },
      },
    );
  }

  const createdAt =
    sandbox.createdAt instanceof Date
      ? sandbox.createdAt.toISOString()
      : String(sandbox.createdAt);
  const updatedAt =
    sandbox.updatedAt instanceof Date
      ? sandbox.updatedAt.toISOString()
      : String(sandbox.updatedAt);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon">
            <Link to="/admin/sandboxes">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="font-display text-xl sm:text-2xl font-semibold tracking-tight">
              {sandbox.name}
            </h1>
            <p className="text-sm text-[var(--wk-text-secondary)]">
              {sandbox.instanceId}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleHealthCheck}
            disabled={healthCheckMutation.isPending}
          >
            <HeartPulse className="h-4 w-4" />
            {healthCheckMutation.isPending ? "Checking..." : "Health Check"}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleRestart}
            disabled={restartMutation.isPending}
          >
            <RefreshCw className="h-4 w-4" />
            {restartMutation.isPending ? "Restarting..." : "Restart Service"}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="h-4 w-4" />
            Terminate
          </Button>
        </div>
      </div>

      {/* Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Server className="h-5 w-5" />
            Overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <InfoField label="Environment">
              {envLabels[sandbox.environment] ?? sandbox.environment}
            </InfoField>
            <InfoField label="Instance Type">
              <span className="font-mono text-sm">{sandbox.instanceType}</span>
            </InfoField>
            <InfoField label="Status">
              <SandboxStatusBadge status={sandbox.status} />
            </InfoField>
            <InfoField label="Health">
              <SandboxHealthIndicator
                healthStatus={sandbox.healthStatus}
                lastCheckAt={sandbox.lastHealthCheckAt}
              />
            </InfoField>
            <InfoField label="Load">
              <SandboxMetrics
                currentLoad={sandbox.currentLoad}
                capacity={sandbox.capacity}
              />
            </InfoField>
            <InfoField label="Public IP">
              {sandbox.publicIp ? (
                <span className="font-mono text-sm">{sandbox.publicIp}</span>
              ) : (
                <span className="text-[var(--wk-text-tertiary)]">-</span>
              )}
            </InfoField>
            <InfoField label="Private IP">
              {sandbox.privateIp ? (
                <span className="font-mono text-sm">{sandbox.privateIp}</span>
              ) : (
                <span className="text-[var(--wk-text-tertiary)]">-</span>
              )}
            </InfoField>
            <InfoField label="SSH Key">
              {sandbox.sshKeyName ?? (
                <span className="text-[var(--wk-text-tertiary)]">-</span>
              )}
            </InfoField>
            <InfoField label="AdsPower Version">
              {sandbox.adspowerVersion ?? (
                <span className="text-[var(--wk-text-tertiary)]">-</span>
              )}
            </InfoField>
            <InfoField label="Created">
              {formatRelativeTime(createdAt)}
            </InfoField>
            <InfoField label="Updated">
              {formatRelativeTime(updatedAt)}
            </InfoField>
            {sandbox.novncUrl && (
              <InfoField label="noVNC">
                <a
                  href={`${sandbox.novncUrl}/vnc.html`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-[var(--wk-copilot)] hover:underline flex items-center gap-1"
                >
                  Open VNC
                  <ExternalLink className="h-3 w-3" />
                </a>
              </InfoField>
            )}
          </div>
        </CardContent>
      </Card>

      {/* EC2 Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Power className="h-5 w-5" />
            EC2 Controls
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <Ec2StatusBadge status={ec2Status} />
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleStart}
                disabled={
                  ec2Status === "running" ||
                  ec2Status === "pending" ||
                  startMutation.isPending
                }
              >
                {startMutation.isPending ? (
                  <LoadingSpinner size="sm" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                Start Instance
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setStopOpen(true)}
                disabled={
                  ec2Status === "stopped" ||
                  ec2Status === "stopping" ||
                  ec2Status === "terminated" ||
                  stopMutation.isPending
                }
              >
                {stopMutation.isPending ? (
                  <LoadingSpinner size="sm" />
                ) : (
                  <Square className="h-4 w-4" />
                )}
                Stop Instance
              </Button>
            </div>
          </div>

          <div className="border-t border-[var(--wk-border-subtle)] pt-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <Switch
                  checked={sandbox.autoStopEnabled ?? false}
                  onCheckedChange={handleAutoStopToggle}
                  disabled={updateMutation.isPending}
                />
                <div>
                  <label className="text-sm font-medium text-[var(--wk-text-primary)]">
                    Auto-stop when idle
                  </label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <p className="text-xs text-[var(--wk-text-tertiary)] cursor-help">
                          Saves ~$50/mo if stopped 12hr/day
                        </p>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>
                          Automatically stops the instance when no tasks are
                          running for the configured idle period.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>

              {sandbox.autoStopEnabled && (
                <Select
                  value={String(sandbox.idleMinutesBeforeStop ?? 60)}
                  onValueChange={handleIdleMinutesChange}
                >
                  <SelectTrigger className="w-[160px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="15">15 minutes</SelectItem>
                    <SelectItem value="30">30 minutes</SelectItem>
                    <SelectItem value="60">1 hour</SelectItem>
                    <SelectItem value="120">2 hours</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Connection Info */}
      <SandboxConnectionInfo
        publicIp={sandbox.publicIp}
        sshKeyName={sandbox.sshKeyName}
      />

      {/* System Metrics */}
      {metrics && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Cpu className="h-5 w-5" />
              System Metrics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard
                icon={<Cpu className="h-4 w-4" />}
                label="CPU"
                value={
                  metrics.cpu != null ? `${metrics.cpu.toFixed(1)}%` : "-"
                }
                barValue={metrics.cpu ?? 0}
              />
              <MetricCard
                icon={<MemoryStick className="h-4 w-4" />}
                label="Memory"
                value={
                  metrics.memoryUsedMb != null && metrics.memoryTotalMb != null
                    ? `${metrics.memoryUsedMb} / ${metrics.memoryTotalMb} MB`
                    : "-"
                }
                barValue={
                  metrics.memoryUsedMb != null && metrics.memoryTotalMb != null
                    ? (metrics.memoryUsedMb / metrics.memoryTotalMb) * 100
                    : 0
                }
              />
              <MetricCard
                icon={<HardDrive className="h-4 w-4" />}
                label="Disk"
                value={
                  metrics.diskUsedGb != null && metrics.diskTotalGb != null
                    ? `${metrics.diskUsedGb.toFixed(1)} / ${metrics.diskTotalGb.toFixed(1)} GB`
                    : "-"
                }
                barValue={
                  metrics.diskUsedGb != null && metrics.diskTotalGb != null
                    ? (metrics.diskUsedGb / metrics.diskTotalGb) * 100
                    : 0
                }
              />
              <div className="rounded-[var(--wk-radius-lg)] border border-[var(--wk-border-subtle)] p-4 space-y-2">
                <div className="flex items-center gap-2 text-[var(--wk-text-secondary)]">
                  <Wifi className="h-4 w-4" />
                  <span className="text-xs font-medium uppercase tracking-wider">
                    Services
                  </span>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span>AdsPower</span>
                    <span
                      className={
                        metrics.adspowerStatus === "running"
                          ? "text-[var(--wk-status-success)]"
                          : "text-[var(--wk-status-error)]"
                      }
                    >
                      {metrics.adspowerStatus}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span>Hatchet</span>
                    <span
                      className={
                        metrics.hatchetConnected
                          ? "text-[var(--wk-status-success)]"
                          : "text-[var(--wk-status-error)]"
                      }
                    >
                      {metrics.hatchetConnected ? "Connected" : "Disconnected"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span>Active Profiles</span>
                    <span className="font-medium">{metrics.activeProfiles}</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Live View */}
      {sandbox.novncUrl && (
        <LiveView
          url={sandbox.novncUrl}
          isVisible={showLiveView}
          onToggle={() => setShowLiveView(!showLiveView)}
        />
      )}

      {/* Tags */}
      {sandbox.tags && Object.keys(sandbox.tags).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Tags</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {Object.entries(sandbox.tags).map(([key, val]) => (
                <div
                  key={key}
                  className="inline-flex items-center rounded-[var(--wk-radius-md)] bg-[var(--wk-surface-sunken)] px-2.5 py-1 text-xs"
                >
                  <span className="font-medium text-[var(--wk-text-primary)]">
                    {key}
                  </span>
                  <span className="mx-1 text-[var(--wk-text-tertiary)]">=</span>
                  <span className="text-[var(--wk-text-secondary)]">
                    {String(val)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stop confirmation */}
      <Dialog open={stopOpen} onOpenChange={setStopOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Stop EC2 Instance?</DialogTitle>
            <DialogDescription>
              The instance will stop and you will save ~$0.042/hour on compute
              costs. EBS storage ($3.44/month) will continue. You can start it
              again anytime.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setStopOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleStop}
              disabled={stopMutation.isPending}
            >
              {stopMutation.isPending ? (
                <>
                  <LoadingSpinner size="sm" />
                  Stopping...
                </>
              ) : (
                "Stop Instance"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Terminate Sandbox</DialogTitle>
            <DialogDescription>
              Are you sure you want to terminate{" "}
              <span className="font-medium text-[var(--wk-text-primary)]">
                {sandbox.name}
              </span>
              ? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Terminating..." : "Terminate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InfoField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wider text-[var(--wk-text-secondary)]">
        {label}
      </p>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  barValue,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  barValue: number;
}) {
  const barColor =
    barValue >= 90
      ? "bg-[var(--wk-status-error)]"
      : barValue >= 70
        ? "bg-[var(--wk-status-warning)]"
        : "bg-[var(--wk-status-success)]";

  return (
    <div className="rounded-[var(--wk-radius-lg)] border border-[var(--wk-border-subtle)] p-4 space-y-2">
      <div className="flex items-center gap-2 text-[var(--wk-text-secondary)]">
        {icon}
        <span className="text-xs font-medium uppercase tracking-wider">
          {label}
        </span>
      </div>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      <div className="h-1.5 w-full rounded-full bg-[var(--wk-surface-sunken)] overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${Math.min(barValue, 100)}%` }}
        />
      </div>
    </div>
  );
}
