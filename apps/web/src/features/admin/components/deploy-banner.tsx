import { useState } from "react";
import { Card, CardContent } from "@valet/ui/components/card";
import { Button } from "@valet/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@valet/ui/components/dialog";
import { Link } from "react-router-dom";
import { Rocket, ExternalLink, X, CheckCircle, XCircle, Loader2, Clock, Ban } from "lucide-react";
import { toast } from "sonner";
import { formatRelativeTime } from "@/lib/utils";
import {
  useDeploys,
  useTriggerDeploy,
  useDeployStatus,
  useCancelDeploy,
} from "../hooks/use-sandboxes";

export function DeployBanner() {
  const deploysQuery = useDeploys();
  const [selectedDeployId, setSelectedDeployId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const deploys = deploysQuery.data?.status === 200 ? deploysQuery.data.body.data : [];
  const pendingDeploys = deploys.filter((d) => d.status === "pending");
  const activeDeploys = deploys.filter((d) => d.status === "deploying" || d.status === "draining");

  if (pendingDeploys.length === 0 && activeDeploys.length === 0) return null;

  return (
    <div className="space-y-3">
      {pendingDeploys.map((deploy) => (
        <Card key={deploy.id} className="border-[var(--wk-copilot)] bg-[var(--wk-copilot)]/5">
          <CardContent className="py-3">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <Rocket className="h-5 w-5 text-[var(--wk-copilot)] shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    GhostHands Deploy Ready: <span className="font-mono">{deploy.imageTag}</span>
                  </p>
                  <p className="text-xs text-[var(--wk-text-secondary)] truncate">
                    {deploy.commitMessage} ({deploy.commitSha.slice(0, 7)} on {deploy.branch})
                    {" — "}
                    {formatRelativeTime(
                      deploy.createdAt instanceof Date
                        ? deploy.createdAt.toISOString()
                        : String(deploy.createdAt),
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {deploy.runUrl && (
                  <Button variant="ghost" size="sm" asChild>
                    <a href={deploy.runUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={() => {
                    setSelectedDeployId(deploy.id);
                    setConfirmOpen(true);
                  }}
                >
                  <Rocket className="h-4 w-4 mr-1" />
                  Deploy Now
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      {activeDeploys.map((deploy) => (
        <ActiveDeployCard key={deploy.id} deployId={deploy.id} />
      ))}

      <div className="text-center">
        <Link
          to="/admin/deploys"
          className="text-xs text-[var(--wk-text-secondary)] hover:text-[var(--wk-text-primary)] underline"
        >
          View all deploys →
        </Link>
      </div>

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

function ActiveDeployCard({ deployId }: { deployId: string }) {
  const statusQuery = useDeployStatus(deployId);
  const cancelMutation = useCancelDeploy();

  const deploy = statusQuery.data?.status === 200 ? statusQuery.data.body : null;
  if (!deploy) return null;

  const isActive = deploy.status === "deploying" || deploy.status === "draining";

  return (
    <Card className="border-[var(--wk-status-warning)]">
      <CardContent className="py-3 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-[var(--wk-status-warning)]" />
            <span className="text-sm font-medium">
              Deploying <span className="font-mono">{deploy.imageTag}</span>...
            </span>
          </div>
          {isActive && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                cancelMutation.mutate(
                  { params: { id: deployId }, body: {} },
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
        {deploy.sandboxes.length > 0 && (
          <div className="space-y-1.5">
            {deploy.sandboxes.map((sb) => (
              <div key={sb.sandboxId} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <SandboxDeployStatusIcon status={sb.status} />
                  <span className="font-medium">{sb.sandboxName}</span>
                </div>
                <span className="text-[var(--wk-text-tertiary)]">{sb.message ?? sb.status}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SandboxDeployStatusIcon({ status }: { status: string }) {
  switch (status) {
    case "completed":
      return <CheckCircle className="h-3.5 w-3.5 text-[var(--wk-status-success)]" />;
    case "failed":
      return <XCircle className="h-3.5 w-3.5 text-[var(--wk-status-error)]" />;
    case "deploying":
    case "draining":
      return <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--wk-status-warning)]" />;
    case "skipped":
      return <Ban className="h-3.5 w-3.5 text-[var(--wk-text-tertiary)]" />;
    default:
      return <Clock className="h-3.5 w-3.5 text-[var(--wk-text-tertiary)]" />;
  }
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
