import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@valet/ui/components/card";
import { Badge } from "@valet/ui/components/badge";
import { Button } from "@valet/ui/components/button";
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
  Ship,
  Lock,
  Unlock,
  ChevronDown,
  ChevronRight,
  Loader2,
  Rocket,
  Undo2,
  ScrollText,
} from "lucide-react";
import { toast } from "sonner";
import { formatRelativeTime } from "@/lib/utils";
import {
  useAtmKamalStatus,
  useAtmKamalAudit,
  useAtmKamalDeploy,
  useAtmKamalRollback,
} from "../hooks/use-sandboxes";
import type { AtmKamalAuditEntry } from "../hooks/use-sandboxes";

const auditStatusVariant: Record<string, "success" | "error" | "default"> = {
  success: "success",
  failure: "error",
};

interface AtmKamalCardProps {
  sandboxId: string;
  enabled?: boolean;
}

export function AtmKamalCard({ sandboxId, enabled = true }: AtmKamalCardProps) {
  const { data: status, isLoading: statusLoading } = useAtmKamalStatus(sandboxId, enabled);
  const { data: auditEntries, isLoading: auditLoading } = useAtmKamalAudit(sandboxId, enabled);
  const deployMutation = useAtmKamalDeploy(sandboxId);
  const rollbackMutation = useAtmKamalRollback(sandboxId);

  const [auditExpanded, setAuditExpanded] = useState(false);
  const [deployOpen, setDeployOpen] = useState(false);
  const [rollbackOpen, setRollbackOpen] = useState(false);

  if (statusLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Ship className="h-4 w-4" />
            Kamal
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (status === null || status === undefined) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Ship className="h-4 w-4" />
            Kamal
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[var(--wk-text-tertiary)]">
            Kamal is not available for this sandbox.
          </p>
        </CardContent>
      </Card>
    );
  }

  function handleDeploy() {
    deployMutation.mutate(
      {},
      {
        onSuccess: () => {
          toast.success("Kamal deploy triggered.");
          setDeployOpen(false);
        },
        onError: () => {
          toast.error("Kamal deploy failed.");
        },
      },
    );
  }

  function handleRollback() {
    rollbackMutation.mutate(
      { version: "previous" },
      {
        onSuccess: () => {
          toast.success("Kamal rollback triggered.");
          setRollbackOpen(false);
        },
        onError: () => {
          toast.error("Kamal rollback failed.");
        },
      },
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Ship className="h-4 w-4" />
            Kamal
            {status.available ? (
              <Badge variant="success" className="text-xs">
                Available
              </Badge>
            ) : (
              <Badge variant="error" className="text-xs">
                Unavailable
              </Badge>
            )}
            {status.version && (
              <span className="text-xs font-mono text-[var(--wk-text-tertiary)] font-normal">
                v{status.version}
              </span>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setDeployOpen(true)}
              disabled={!status.available || status.locked}
            >
              <Rocket className="h-3.5 w-3.5 mr-1" />
              Deploy
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setRollbackOpen(true)}
              disabled={!status.available || status.locked}
            >
              <Undo2 className="h-3.5 w-3.5 mr-1" />
              Rollback
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Lock status */}
        {status.locked && (
          <div className="flex items-start gap-2 rounded-md border border-[var(--wk-status-warning)]/20 bg-[var(--wk-status-warning)]/5 px-3 py-2">
            <Lock className="h-4 w-4 text-[var(--wk-status-warning)] mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-[var(--wk-status-warning)]">
                Deploy lock held
              </p>
              {status.lockedBy && (
                <p className="text-xs text-[var(--wk-text-secondary)]">
                  Locked by: {status.lockedBy}
                </p>
              )}
              {status.lockReason && (
                <p className="text-xs text-[var(--wk-text-secondary)]">
                  Reason: {status.lockReason}
                </p>
              )}
            </div>
          </div>
        )}

        {!status.locked && (
          <div className="flex items-center gap-2 text-sm text-[var(--wk-text-secondary)]">
            <Unlock className="h-4 w-4 text-[var(--wk-status-success)]" />
            <span>No deploy lock active</span>
          </div>
        )}

        {/* Audit log section */}
        <div>
          <button
            type="button"
            className="flex items-center gap-1.5 text-sm font-medium text-[var(--wk-text-secondary)] hover:text-[var(--wk-text-primary)] transition-colors"
            onClick={() => setAuditExpanded(!auditExpanded)}
          >
            {auditExpanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
            <ScrollText className="h-3.5 w-3.5" />
            Audit Log
            {auditEntries && auditEntries.length > 0 && (
              <span className="text-xs text-[var(--wk-text-tertiary)] font-normal">
                ({auditEntries.length})
              </span>
            )}
          </button>

          {auditExpanded && (
            <div className="mt-3">
              {auditLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-8 w-full" />
                  ))}
                </div>
              ) : !auditEntries || auditEntries.length === 0 ? (
                <p className="text-xs text-[var(--wk-text-tertiary)] py-4 text-center">
                  No Kamal audit entries.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--wk-border-subtle)]">
                        <th className="pb-2 pr-4 text-left font-medium text-[var(--wk-text-secondary)]">
                          Action
                        </th>
                        <th className="pb-2 pr-4 text-left font-medium text-[var(--wk-text-secondary)]">
                          Performer
                        </th>
                        <th className="pb-2 pr-4 text-left font-medium text-[var(--wk-text-secondary)]">
                          Status
                        </th>
                        <th className="pb-2 pr-4 text-left font-medium text-[var(--wk-text-secondary)]">
                          Duration
                        </th>
                        <th className="pb-2 text-left font-medium text-[var(--wk-text-secondary)]">
                          Time
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--wk-border-subtle)]">
                      {auditEntries.map((entry) => (
                        <AuditRow key={entry.id} entry={entry} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>

      {/* Deploy via Kamal confirmation */}
      <Dialog open={deployOpen} onOpenChange={setDeployOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Deploy via Kamal?</DialogTitle>
            <DialogDescription>
              This will trigger a Kamal deploy to the sandbox. The deploy will pull the latest image
              and perform a zero-downtime rolling update.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDeployOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleDeploy} disabled={deployMutation.isPending}>
              {deployMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  Deploying...
                </>
              ) : (
                <>
                  <Rocket className="h-4 w-4 mr-1" />
                  Deploy
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Kamal rollback confirmation */}
      <Dialog open={rollbackOpen} onOpenChange={setRollbackOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rollback via Kamal?</DialogTitle>
            <DialogDescription>
              This will trigger a Kamal rollback to the previous version.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setRollbackOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleRollback} disabled={rollbackMutation.isPending}>
              {rollbackMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  Rolling back...
                </>
              ) : (
                <>
                  <Undo2 className="h-4 w-4 mr-1" />
                  Rollback
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function AuditRow({ entry }: { entry: AtmKamalAuditEntry }) {
  return (
    <tr className="hover:bg-[var(--wk-surface-raised)] transition-colors">
      <td className="py-2 pr-4 text-xs capitalize">{entry.action.replace(/_/g, " ")}</td>
      <td className="py-2 pr-4 text-xs text-[var(--wk-text-secondary)]">{entry.performer}</td>
      <td className="py-2 pr-4">
        <Badge variant={auditStatusVariant[entry.status] ?? "default"} className="text-xs">
          {entry.status}
        </Badge>
      </td>
      <td className="py-2 pr-4 text-xs text-[var(--wk-text-secondary)] tabular-nums">
        {entry.durationMs != null ? `${entry.durationMs}ms` : "-"}
      </td>
      <td className="py-2 text-xs text-[var(--wk-text-secondary)]">
        {formatRelativeTime(entry.createdAt)}
      </td>
    </tr>
  );
}
