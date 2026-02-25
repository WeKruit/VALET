import { useState } from "react";
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
import { Undo2, ChevronDown, ChevronRight, Loader2, Package } from "lucide-react";
import { toast } from "sonner";
import { formatRelativeTime } from "@/lib/utils";
import { useAtmDeployHistory, useAtmRollback } from "../hooks/use-sandboxes";
import type { AtmDeployRecord } from "../hooks/use-sandboxes";

const statusVariant: Record<string, "success" | "warning" | "error" | "info" | "default"> = {
  deploying: "warning",
  completed: "success",
  failed: "error",
  rolled_back: "info",
};

function formatDuration(ms: number | null): string {
  if (ms == null) return "-";
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}m ${secs}s`;
}

interface AtmDeployHistoryProps {
  sandboxId: string;
  enabled?: boolean;
}

export function AtmDeployHistory({ sandboxId, enabled = true }: AtmDeployHistoryProps) {
  const { data: records, isLoading } = useAtmDeployHistory(sandboxId, enabled);
  const rollbackMutation = useAtmRollback(sandboxId);
  const [rollbackOpen, setRollbackOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (!records || records.length === 0) {
    return (
      <div className="py-8 text-center">
        <Package className="mx-auto h-8 w-8 text-[var(--wk-text-tertiary)]" />
        <p className="mt-2 text-sm text-[var(--wk-text-secondary)]">No ATM deploy history yet.</p>
        <p className="mt-1 text-xs text-[var(--wk-text-tertiary)]">
          Deploys will appear here when triggered through ATM.
        </p>
      </div>
    );
  }

  function handleRollback() {
    rollbackMutation.mutate(undefined, {
      onSuccess: () => {
        toast.success("Rollback initiated.");
        setRollbackOpen(false);
      },
      onError: () => {
        toast.error("Rollback failed.");
      },
    });
  }

  return (
    <div className="space-y-4">
      {/* Rollback action */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-[var(--wk-text-secondary)] uppercase tracking-wider">
          Machine Deploy History (ATM)
        </p>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setRollbackOpen(true)}
          disabled={records.length < 2}
        >
          <Undo2 className="h-3.5 w-3.5 mr-1" />
          Rollback to Previous
        </Button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--wk-border-subtle)]">
              <th className="pb-2 pr-2 text-left font-medium text-[var(--wk-text-secondary)] w-6" />
              <th className="pb-2 pr-4 text-left font-medium text-[var(--wk-text-secondary)]">
                Image Tag
              </th>
              <th className="pb-2 pr-4 text-left font-medium text-[var(--wk-text-secondary)]">
                Status
              </th>
              <th className="pb-2 pr-4 text-left font-medium text-[var(--wk-text-secondary)]">
                Triggered By
              </th>
              <th className="pb-2 pr-4 text-left font-medium text-[var(--wk-text-secondary)]">
                Duration
              </th>
              <th className="pb-2 text-left font-medium text-[var(--wk-text-secondary)]">
                Started
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--wk-border-subtle)]">
            {records.map((record) => (
              <DeployRow
                key={record.id}
                record={record}
                expanded={expandedId === record.id}
                onToggle={() => setExpandedId(expandedId === record.id ? null : record.id)}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Rollback confirmation */}
      <Dialog open={rollbackOpen} onOpenChange={setRollbackOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rollback to Previous Image?</DialogTitle>
            <DialogDescription>
              This will roll back the sandbox to the previously deployed Docker image via ATM.
              Active tasks will be drained first.
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
    </div>
  );
}

function DeployRow({
  record,
  expanded,
  onToggle,
}: {
  record: AtmDeployRecord;
  expanded: boolean;
  onToggle: () => void;
}) {
  const hasError = record.error != null;

  return (
    <>
      <tr
        className="hover:bg-[var(--wk-surface-raised)] transition-colors cursor-pointer"
        onClick={hasError ? onToggle : undefined}
      >
        <td className="py-2.5 pr-2">
          {hasError ? (
            expanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-[var(--wk-text-tertiary)]" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-[var(--wk-text-tertiary)]" />
            )
          ) : null}
        </td>
        <td className="py-2.5 pr-4 font-mono text-xs">{record.imageTag}</td>
        <td className="py-2.5 pr-4">
          <Badge variant={statusVariant[record.status] ?? "default"} className="capitalize">
            {record.status === "rolled_back" ? "rolled back" : record.status}
          </Badge>
        </td>
        <td className="py-2.5 pr-4 text-xs text-[var(--wk-text-secondary)]">
          {record.triggeredBy}
        </td>
        <td className="py-2.5 pr-4 text-xs text-[var(--wk-text-secondary)] tabular-nums">
          {formatDuration(record.durationMs)}
        </td>
        <td className="py-2.5 text-xs text-[var(--wk-text-secondary)]">
          {formatRelativeTime(record.startedAt)}
        </td>
      </tr>
      {expanded && hasError && (
        <tr>
          <td />
          <td colSpan={5} className="pb-3">
            <div className="rounded-md border border-[var(--wk-status-error)]/20 bg-[var(--wk-status-error)]/5 px-3 py-2">
              <p className="text-xs text-[var(--wk-status-error)] font-mono break-all whitespace-pre-wrap">
                {record.error}
              </p>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
