import { useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@valet/ui/components/card";
import { Button } from "@valet/ui/components/button";
import { Input } from "@valet/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@valet/ui/components/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@valet/ui/components/dropdown-menu";
import { Skeleton } from "@valet/ui/components/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@valet/ui/components/dialog";
import {
  Plus,
  Search,
  MoreVertical,
  Eye,
  HeartPulse,
  Trash2,
  Server,
  RefreshCw,
  Play,
  Square,
} from "lucide-react";
import { toast } from "sonner";
import { LoadingSpinner } from "@/components/common/loading-spinner";
import { SandboxStatusBadge } from "../components/sandbox-status-badge";
import { SandboxHealthIndicator } from "../components/sandbox-health-indicator";
import { SandboxMetrics } from "../components/sandbox-metrics";
import { SandboxForm } from "../components/sandbox-form";
import { Ec2StatusBadge } from "../components/ec2-status-badge";
import {
  useSandboxes,
  useCreateSandbox,
  useDeleteSandbox,
  useHealthCheckSandbox,
  useStartSandbox,
  useStopSandbox,
} from "../hooks/use-sandboxes";
import type {
  Ec2Status,
  SandboxEnvironment,
  SandboxStatus,
  SandboxHealthStatus,
  SandboxCreateRequest,
  Sandbox,
} from "../types";

const ALL = "__all__";

const envLabels: Record<SandboxEnvironment, string> = {
  dev: "Development",
  staging: "Staging",
  prod: "Production",
};

export function SandboxesPage() {
  const [search, setSearch] = useState("");
  const [envFilter, setEnvFilter] = useState(ALL);
  const [statusFilter, setStatusFilter] = useState(ALL);
  const [healthFilter, setHealthFilter] = useState(ALL);
  const [ec2StatusFilter, setEc2StatusFilter] = useState(ALL);
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Sandbox | null>(null);

  const query = useSandboxes({
    page,
    pageSize: 20,
    ...(search ? { search } : {}),
    ...(envFilter !== ALL
      ? { environment: envFilter as SandboxEnvironment }
      : {}),
    ...(statusFilter !== ALL
      ? { status: statusFilter as SandboxStatus }
      : {}),
    ...(healthFilter !== ALL
      ? { healthStatus: healthFilter as SandboxHealthStatus }
      : {}),
    ...(ec2StatusFilter !== ALL
      ? { ec2Status: ec2StatusFilter as Ec2Status }
      : {}),
  });

  const createMutation = useCreateSandbox();
  const deleteMutation = useDeleteSandbox();
  const healthCheckMutation = useHealthCheckSandbox();
  const startMutation = useStartSandbox();
  const stopMutation = useStopSandbox();

  const listBody = query.data?.status === 200 ? query.data.body : null;
  const sandboxes = listBody?.data ?? [];
  const total = listBody?.pagination?.total ?? 0;
  const totalPages = listBody?.pagination?.totalPages ?? 1;

  function handleCreate(input: SandboxCreateRequest) {
    createMutation.mutate(
      { body: input },
      {
        onSuccess: (res) => {
          if (res.status === 201) {
            toast.success("Sandbox registered successfully.");
            setCreateOpen(false);
          } else {
            toast.error("Failed to create sandbox.");
          }
        },
        onError: () => {
          toast.error("Failed to create sandbox.");
        },
      },
    );
  }

  function handleDelete() {
    if (!deleteTarget) return;
    deleteMutation.mutate(
      { params: { id: deleteTarget.id }, body: {} },
      {
        onSuccess: () => {
          toast.success(`Sandbox "${deleteTarget.name}" terminated.`);
          setDeleteTarget(null);
        },
        onError: () => {
          toast.error("Failed to terminate sandbox.");
        },
      },
    );
  }

  function handleHealthCheck(sandbox: Sandbox) {
    healthCheckMutation.mutate(
      { params: { id: sandbox.id }, body: {} },
      {
        onSuccess: () => {
          toast.success(`Health check completed for "${sandbox.name}".`);
        },
        onError: () => {
          toast.error("Health check failed.");
        },
      },
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-display font-semibold text-[var(--wk-text-primary)]">
            Sandbox Fleet
          </h1>
          <p className="mt-1 text-sm text-[var(--wk-text-secondary)]">
            Manage EC2 browser automation instances
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          Register Sandbox
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--wk-text-tertiary)]" />
              <Input
                placeholder="Search by name or IP..."
                className="pl-9"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <Select
              value={envFilter}
              onValueChange={(v) => {
                setEnvFilter(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Environment" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All Environments</SelectItem>
                <SelectItem value="dev">Development</SelectItem>
                <SelectItem value="staging">Staging</SelectItem>
                <SelectItem value="prod">Production</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={statusFilter}
              onValueChange={(v) => {
                setStatusFilter(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All Statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="provisioning">Provisioning</SelectItem>
                <SelectItem value="stopping">Stopping</SelectItem>
                <SelectItem value="stopped">Stopped</SelectItem>
                <SelectItem value="terminated">Terminated</SelectItem>
                <SelectItem value="unhealthy">Unhealthy</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={healthFilter}
              onValueChange={(v) => {
                setHealthFilter(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Health" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All Health</SelectItem>
                <SelectItem value="healthy">Healthy</SelectItem>
                <SelectItem value="degraded">Degraded</SelectItem>
                <SelectItem value="unhealthy">Unhealthy</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={ec2StatusFilter}
              onValueChange={(v) => {
                setEc2StatusFilter(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="EC2 Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All EC2</SelectItem>
                <SelectItem value="running">Running</SelectItem>
                <SelectItem value="stopped">Stopped</SelectItem>
                <SelectItem value="pending">Starting</SelectItem>
                <SelectItem value="stopping">Stopping</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => query.refetch()}
              title="Refresh"
            >
              <RefreshCw
                className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`}
              />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="text-base flex items-center gap-2">
            <Server className="h-4 w-4" />
            Instances
            {total > 0 && (
              <span className="text-sm font-normal text-[var(--wk-text-secondary)]">
                ({total})
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {query.isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : query.isError ? (
            <div className="py-12 text-center text-sm text-[var(--wk-status-error)]">
              Failed to load sandboxes. Please try refreshing.
            </div>
          ) : sandboxes.length === 0 ? (
            <div className="py-12 text-center">
              <Server className="mx-auto h-10 w-10 text-[var(--wk-text-tertiary)]" />
              <p className="mt-3 text-sm font-medium text-[var(--wk-text-primary)]">
                No sandboxes found
              </p>
              <p className="mt-1 text-sm text-[var(--wk-text-secondary)]">
                Register your first sandbox to get started.
              </p>
              <Button
                className="mt-4"
                variant="secondary"
                onClick={() => setCreateOpen(true)}
              >
                <Plus className="h-4 w-4" />
                Register Sandbox
              </Button>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--wk-border-subtle)]">
                      <th className="pb-3 pr-4 text-left font-medium text-[var(--wk-text-secondary)]">
                        Name
                      </th>
                      <th className="pb-3 pr-4 text-left font-medium text-[var(--wk-text-secondary)]">
                        Environment
                      </th>
                      <th className="pb-3 pr-4 text-left font-medium text-[var(--wk-text-secondary)]">
                        Instance
                      </th>
                      <th className="pb-3 pr-4 text-left font-medium text-[var(--wk-text-secondary)]">
                        IP
                      </th>
                      <th className="pb-3 pr-4 text-left font-medium text-[var(--wk-text-secondary)]">
                        Status
                      </th>
                      <th className="pb-3 pr-4 text-left font-medium text-[var(--wk-text-secondary)]">
                        Health
                      </th>
                      <th className="pb-3 pr-4 text-left font-medium text-[var(--wk-text-secondary)]">
                        Load
                      </th>
                      <th className="pb-3 pr-4 text-left font-medium text-[var(--wk-text-secondary)]">
                        EC2
                      </th>
                      <th className="pb-3 text-right font-medium text-[var(--wk-text-secondary)]">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--wk-border-subtle)]">
                    {sandboxes.map((sb) => (
                      <tr
                        key={sb.id}
                        className="group hover:bg-[var(--wk-surface-raised)] transition-colors"
                      >
                        <td className="py-3 pr-4">
                          <Link
                            to={`/admin/sandboxes/${sb.id}`}
                            className="font-medium text-[var(--wk-text-primary)] hover:text-[var(--wk-copilot)] hover:underline"
                          >
                            {sb.name}
                          </Link>
                        </td>
                        <td className="py-3 pr-4 text-[var(--wk-text-secondary)]">
                          {envLabels[sb.environment] ?? sb.environment}
                        </td>
                        <td className="py-3 pr-4 font-mono text-xs text-[var(--wk-text-secondary)]">
                          {sb.instanceType}
                        </td>
                        <td className="py-3 pr-4 font-mono text-xs text-[var(--wk-text-secondary)]">
                          {sb.publicIp ?? "-"}
                        </td>
                        <td className="py-3 pr-4">
                          <SandboxStatusBadge status={sb.status} />
                        </td>
                        <td className="py-3 pr-4">
                          <SandboxHealthIndicator
                            healthStatus={sb.healthStatus}
                            lastCheckAt={sb.lastHealthCheckAt}
                          />
                        </td>
                        <td className="py-3 pr-4">
                          <SandboxMetrics
                            currentLoad={sb.currentLoad}
                            capacity={sb.capacity}
                          />
                        </td>
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-1.5">
                            <Ec2StatusBadge status={sb.ec2Status} />
                            {sb.ec2Status === "stopped" && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  startMutation.mutate(
                                    { params: { id: sb.id }, body: {} },
                                    {
                                      onSuccess: () =>
                                        toast.success(
                                          `Starting "${sb.name}"...`,
                                        ),
                                      onError: () =>
                                        toast.error("Failed to start."),
                                    },
                                  );
                                }}
                                disabled={startMutation.isPending}
                                title="Start instance"
                              >
                                <Play className="h-3 w-3" />
                              </Button>
                            )}
                            {sb.ec2Status === "running" && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  stopMutation.mutate(
                                    { params: { id: sb.id }, body: {} },
                                    {
                                      onSuccess: () =>
                                        toast.success(
                                          `Stopping "${sb.name}"...`,
                                        ),
                                      onError: () =>
                                        toast.error("Failed to stop."),
                                    },
                                  );
                                }}
                                disabled={stopMutation.isPending}
                                title="Stop instance"
                              >
                                <Square className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        </td>
                        <td className="py-3 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem asChild>
                                <Link to={`/admin/sandboxes/${sb.id}`}>
                                  <Eye className="mr-2 h-4 w-4" />
                                  View Details
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleHealthCheck(sb)}
                                disabled={healthCheckMutation.isPending}
                              >
                                <HeartPulse className="mr-2 h-4 w-4" />
                                Health Check
                              </DropdownMenuItem>
                              {sb.ec2Status === "stopped" && (
                                <DropdownMenuItem
                                  onClick={() =>
                                    startMutation.mutate(
                                      { params: { id: sb.id }, body: {} },
                                      {
                                        onSuccess: () =>
                                          toast.success(`Starting "${sb.name}"...`),
                                        onError: () =>
                                          toast.error("Failed to start."),
                                      },
                                    )
                                  }
                                  disabled={startMutation.isPending}
                                >
                                  <Play className="mr-2 h-4 w-4" />
                                  Start Instance
                                </DropdownMenuItem>
                              )}
                              {sb.ec2Status === "running" && (
                                <DropdownMenuItem
                                  onClick={() =>
                                    stopMutation.mutate(
                                      { params: { id: sb.id }, body: {} },
                                      {
                                        onSuccess: () =>
                                          toast.success(`Stopping "${sb.name}"...`),
                                        onError: () =>
                                          toast.error("Failed to stop."),
                                      },
                                    )
                                  }
                                  disabled={stopMutation.isPending}
                                >
                                  <Square className="mr-2 h-4 w-4" />
                                  Stop Instance
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-[var(--wk-status-error)] focus:text-[var(--wk-status-error)]"
                                onClick={() => setDeleteTarget(sb)}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Terminate
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between border-t border-[var(--wk-border-subtle)] pt-4">
                  <p className="text-sm text-[var(--wk-text-secondary)]">
                    Page {page} of {totalPages}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Create modal */}
      <SandboxForm
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={handleCreate}
        isPending={createMutation.isPending}
      />

      {/* Delete confirmation dialog */}
      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Terminate Sandbox</DialogTitle>
            <DialogDescription>
              Are you sure you want to terminate{" "}
              <span className="font-medium text-[var(--wk-text-primary)]">
                {deleteTarget?.name}
              </span>
              ? This action cannot be undone and will destroy the EC2 instance.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => setDeleteTarget(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <>
                  <LoadingSpinner size="sm" />
                  Terminating...
                </>
              ) : (
                "Terminate"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
