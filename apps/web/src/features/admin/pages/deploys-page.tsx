import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@valet/ui/components/card";
import { Button } from "@valet/ui/components/button";
import { Badge } from "@valet/ui/components/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@valet/ui/components/dialog";
import {
  Rocket,
  RefreshCw,
  ExternalLink,
  CheckCircle,
  XCircle,
  Loader2,
  Clock,
  Ban,
  X,
  Container,
  GitBranch,
  GitCommitHorizontal,
  AlertTriangle,
} from "lucide-react";
import { Switch } from "@valet/ui/components/switch";
import { toast } from "sonner";
import { formatRelativeTime } from "@/lib/utils";
import { useAuth } from "@/features/auth/hooks/use-auth";
import {
  useDeploys,
  useTriggerDeploy,
  useDeployStatus,
  useCancelDeploy,
  useAutoDeployConfig,
  useUpdateAutoDeployConfig,
} from "../hooks/use-sandboxes";

type DeployStatusValue =
  | "pending"
  | "deploying"
  | "draining"
  | "completed"
  | "failed"
  | "cancelled";

type SandboxStatusValue = "pending" | "draining" | "deploying" | "completed" | "failed" | "skipped";

const STATUS_CONFIG: Record<
  DeployStatusValue,
  { label: string; variant: "default" | "secondary" | "error" | "success" | "warning" | "info" }
> = {
  pending: { label: "Pending", variant: "secondary" },
  deploying: { label: "Deploying", variant: "warning" },
  draining: { label: "Draining", variant: "warning" },
  completed: { label: "Completed", variant: "success" },
  failed: { label: "Failed", variant: "error" },
  cancelled: { label: "Cancelled", variant: "secondary" },
};

export function DeploysPage() {
  const deploysQuery = useDeploys();
  const [selectedDeployId, setSelectedDeployId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const deploys = deploysQuery.data?.status === 200 ? deploysQuery.data.body.data : [];

  // Listen for WebSocket deploy updates to auto-refetch
  const { user } = useAuth();
  const handleWsMessage = useCallback(
    (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "deploy_ready" || data.type === "deploy_update") {
          deploysQuery.refetch();
        }
      } catch {
        // ignore non-JSON messages
      }
    },
    [deploysQuery],
  );

  useEffect(() => {
    if (!user) return;
    // The WS connection is handled globally; listen for custom events
    const handler = (e: Event) => handleWsMessage(e as MessageEvent);
    window.addEventListener("ws:deploy_update", handler);
    window.addEventListener("ws:deploy_ready", handler);
    return () => {
      window.removeEventListener("ws:deploy_update", handler);
      window.removeEventListener("ws:deploy_ready", handler);
    };
  }, [user, handleWsMessage]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-display font-semibold text-[var(--wk-text-primary)]">
            Deploys
          </h1>
          <p className="mt-1 text-sm text-[var(--wk-text-secondary)]">
            GhostHands image deployments to EC2 sandboxes
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={() => deploysQuery.refetch()} title="Refresh">
          <RefreshCw className={`h-4 w-4 ${deploysQuery.isFetching ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Auto-deploy config */}
      <AutoDeploySettings />

      {/* Deploy list */}
      {deploysQuery.isLoading ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Loader2 className="h-6 w-6 animate-spin mx-auto text-[var(--wk-text-tertiary)]" />
            <p className="mt-2 text-sm text-[var(--wk-text-secondary)]">Loading deploys...</p>
          </CardContent>
        </Card>
      ) : deploys.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Container className="h-8 w-8 mx-auto text-[var(--wk-text-tertiary)]" />
            <p className="mt-3 text-sm font-medium text-[var(--wk-text-secondary)]">
              No deploys yet
            </p>
            <p className="mt-1 text-xs text-[var(--wk-text-tertiary)]">
              Deploys appear when GhostHands CI fires the deploy webhook.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {deploys.map((deploy) => (
            <DeployCard
              key={deploy.id}
              deploy={deploy}
              onTrigger={() => {
                setSelectedDeployId(deploy.id);
                setConfirmOpen(true);
              }}
            />
          ))}
        </div>
      )}

      {selectedDeployId && (
        <DeployConfirmDialog
          deployId={selectedDeployId}
          open={confirmOpen}
          onOpenChange={(open) => {
            setConfirmOpen(open);
            if (!open) setSelectedDeployId(null);
          }}
        />
      )}
    </div>
  );
}

function AutoDeploySettings() {
  const configQuery = useAutoDeployConfig();
  const updateMutation = useUpdateAutoDeployConfig();

  const config = configQuery.data;

  function toggle(key: "autoDeployStaging" | "autoDeployProd", current: boolean) {
    updateMutation.mutate(
      { [key]: !current },
      {
        onSuccess: () => toast.success(`Auto-deploy ${!current ? "enabled" : "disabled"}`),
        onError: () => toast.error("Failed to update auto-deploy config"),
      },
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">Auto-deploy Settings</CardTitle>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:gap-8">
          <div className="flex items-center gap-3">
            <Switch
              id="auto-deploy-staging"
              checked={config?.autoDeployStaging ?? false}
              onCheckedChange={() =>
                config && toggle("autoDeployStaging", config.autoDeployStaging)
              }
              disabled={!config || updateMutation.isPending}
            />
            <label htmlFor="auto-deploy-staging" className="text-sm cursor-pointer">
              Auto-deploy <span className="font-medium">staging</span>
            </label>
          </div>
          <div className="flex items-center gap-3">
            <Switch
              id="auto-deploy-prod"
              checked={config?.autoDeployProd ?? false}
              onCheckedChange={() => config && toggle("autoDeployProd", config.autoDeployProd)}
              disabled={!config || updateMutation.isPending}
            />
            <label htmlFor="auto-deploy-prod" className="text-sm cursor-pointer">
              Auto-deploy <span className="font-medium">production</span>
            </label>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DeployCard({
  deploy,
  onTrigger,
}: {
  deploy: {
    id: string;
    imageTag: string;
    commitSha: string;
    commitMessage: string;
    branch: string;
    environment: string;
    status: string;
    runUrl?: string;
    createdAt: string | Date;
    updatedAt: string | Date;
    sandboxes?: Array<{
      sandboxId: string;
      sandboxName: string;
      status: string;
      activeTaskCount: number;
      message?: string | null;
    }>;
  };
  onTrigger: () => void;
}) {
  const cancelMutation = useCancelDeploy();
  const status = deploy.status as DeployStatusValue;
  const isActive = status === "deploying" || status === "draining";
  const isPending = status === "pending";
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;

  const createdStr =
    deploy.createdAt instanceof Date ? deploy.createdAt.toISOString() : String(deploy.createdAt);

  return (
    <Card
      className={
        isActive
          ? "border-[var(--wk-status-warning)]"
          : isPending
            ? "border-[var(--wk-copilot)]"
            : undefined
      }
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <CardTitle className="text-base flex items-center gap-2 flex-wrap">
              <span className="font-mono text-sm">{deploy.imageTag}</span>
              <Badge variant={config.variant}>{config.label}</Badge>
              <Badge variant="secondary" className="text-xs">
                {deploy.environment}
              </Badge>
            </CardTitle>
            <p className="mt-1.5 text-sm text-[var(--wk-text-secondary)] truncate">
              {deploy.commitMessage}
            </p>
            <div className="mt-2 flex items-center gap-4 text-xs text-[var(--wk-text-tertiary)]">
              <span className="flex items-center gap-1">
                <GitCommitHorizontal className="h-3 w-3" />
                {deploy.commitSha.slice(0, 7)}
              </span>
              <span className="flex items-center gap-1">
                <GitBranch className="h-3 w-3" />
                {deploy.branch}
              </span>
              <span>{formatRelativeTime(createdStr)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {deploy.runUrl && (
              <Button variant="ghost" size="sm" asChild>
                <a href={deploy.runUrl} target="_blank" rel="noopener noreferrer" title="CI Run">
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </Button>
            )}
            {isPending && (
              <Button size="sm" onClick={onTrigger}>
                <Rocket className="h-4 w-4 mr-1" />
                Deploy
              </Button>
            )}
            {isActive && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  cancelMutation.mutate(
                    { params: { id: deploy.id }, body: {} },
                    {
                      onSuccess: () => toast.success("Deploy cancelled"),
                      onError: () => toast.error("Failed to cancel"),
                    },
                  )
                }
                disabled={cancelMutation.isPending}
              >
                <X className="h-4 w-4 mr-1" />
                Cancel
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      {/* Deploy-level failure with no sandbox details */}
      {status === "failed" && (!deploy.sandboxes || deploy.sandboxes.length === 0) && (
        <CardContent className="pt-0 pb-4">
          <div className="border-t border-[var(--wk-border-subtle)] pt-3">
            <div className="rounded-md border border-[var(--wk-status-error)]/20 bg-[var(--wk-status-error)]/5 px-3 py-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-3.5 w-3.5 text-[var(--wk-status-error)] mt-0.5 shrink-0" />
                <p className="text-xs text-[var(--wk-status-error)]">
                  Deploy failed before reaching any sandboxes. This usually means no running
                  sandboxes were found for the{" "}
                  <span className="font-medium">{deploy.environment}</span> environment.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      )}

      {/* Per-sandbox progress */}
      {deploy.sandboxes && deploy.sandboxes.length > 0 && (
        <CardContent className="pt-0 pb-4">
          <div className="border-t border-[var(--wk-border-subtle)] pt-3 space-y-2">
            <p className="text-xs font-medium text-[var(--wk-text-secondary)] uppercase tracking-wider">
              Sandbox Progress
            </p>
            {deploy.sandboxes.map((sb) => {
              const sbStatus = sb.status as SandboxStatusValue;
              const isFailed = sbStatus === "failed";
              return (
                <div key={sb.sandboxId} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <SandboxStatusIcon status={sbStatus} />
                      <span className="font-medium">{sb.sandboxName}</span>
                    </div>
                    <span
                      className={`text-xs ${isFailed ? "text-[var(--wk-status-error)] font-medium" : "text-[var(--wk-text-tertiary)]"}`}
                    >
                      {isFailed ? "Failed" : (sb.message ?? sb.status)}
                    </span>
                  </div>
                  {isFailed && sb.message && (
                    <div className="ml-6 rounded-md border border-[var(--wk-status-error)]/20 bg-[var(--wk-status-error)]/5 px-3 py-2">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="h-3.5 w-3.5 text-[var(--wk-status-error)] mt-0.5 shrink-0" />
                        <p className="text-xs text-[var(--wk-status-error)] font-mono break-all whitespace-pre-wrap">
                          {formatAgentError(sb.message)}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function SandboxStatusIcon({ status }: { status: SandboxStatusValue }) {
  switch (status) {
    case "completed":
      return <CheckCircle className="h-4 w-4 text-[var(--wk-status-success)]" />;
    case "failed":
      return <XCircle className="h-4 w-4 text-[var(--wk-status-error)]" />;
    case "deploying":
    case "draining":
      return <Loader2 className="h-4 w-4 animate-spin text-[var(--wk-status-warning)]" />;
    case "skipped":
      return <Ban className="h-4 w-4 text-[var(--wk-text-tertiary)]" />;
    default:
      return <Clock className="h-4 w-4 text-[var(--wk-text-tertiary)]" />;
  }
}

/**
 * Parse AgentError messages into human-readable format.
 * Input:  "Agent 401: {"success":false,"message":"Unauthorized: invalid or missing X-Deploy-Secret"}"
 * Output: "HTTP 401: Unauthorized: invalid or missing X-Deploy-Secret"
 */
function formatAgentError(message: string): string {
  const match = message.match(/^Agent (\d+): (.+)$/s);
  if (match) {
    const statusCode = match[1] ?? "???";
    const body = match[2] ?? "";
    try {
      const parsed = JSON.parse(body) as Record<string, unknown>;
      if (typeof parsed.message === "string") return `HTTP ${statusCode}: ${parsed.message}`;
    } catch {
      // body isn't JSON, use as-is
    }
    return `HTTP ${statusCode}: ${body}`;
  }
  return message;
}

function DeployConfirmDialog({
  deployId,
  open,
  onOpenChange,
}: {
  deployId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const triggerMutation = useTriggerDeploy();
  const statusQuery = useDeployStatus(deployId, open);

  const deploy = statusQuery.data?.status === 200 ? statusQuery.data.body : null;

  function handleDeploy() {
    triggerMutation.mutate(
      { params: { id: deployId }, body: {} },
      {
        onSuccess: () => {
          toast.success("Rolling deploy started!");
          onOpenChange(false);
        },
        onError: (err) => {
          const msg =
            err && typeof err === "object" && "body" in err
              ? String((err as any).body?.message ?? "Unknown error")
              : "Failed to start deploy";
          toast.error(msg);
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Deploy GhostHands Update</DialogTitle>
          <DialogDescription>
            This will perform a rolling deploy across all running sandboxes in the{" "}
            <span className="font-medium text-[var(--wk-text-primary)]">
              {deploy?.environment ?? "..."}
            </span>{" "}
            environment. Active tasks will be drained before each sandbox is updated.
          </DialogDescription>
        </DialogHeader>
        {deploy && (
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-[var(--wk-text-secondary)]">Image</span>
              <span className="font-mono">{deploy.imageTag}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--wk-text-secondary)]">Commit</span>
              <span className="font-mono">{deploy.commitSha.slice(0, 7)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--wk-text-secondary)]">Branch</span>
              <span>{deploy.branch}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--wk-text-secondary)]">Message</span>
              <span className="text-right max-w-[200px] truncate">{deploy.commitMessage}</span>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleDeploy} disabled={triggerMutation.isPending}>
            {triggerMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                Deploying...
              </>
            ) : (
              <>
                <Rocket className="h-4 w-4 mr-1" />
                Start Rolling Deploy
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
