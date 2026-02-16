import { useState } from "react";
import { Button } from "@valet/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@valet/ui/components/dialog";
import { Skeleton } from "@valet/ui/components/skeleton";
import { Globe, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { LoadingSpinner } from "@/components/common/loading-spinner";
import { formatDistanceToNow, format } from "date-fns";
import { useSessions, useClearSession } from "../hooks/use-sessions";
import type { BrowserSession } from "@valet/shared/schemas";

export function SessionTable() {
  const query = useSessions();
  const clearMutation = useClearSession();
  const [deleteTarget, setDeleteTarget] = useState<BrowserSession | null>(null);

  const sessions = query.data?.status === 200 ? query.data.body.sessions : [];

  function handleClear() {
    if (!deleteTarget) return;
    clearMutation.mutate(
      { params: { domain: deleteTarget.domain }, body: {} },
      {
        onSuccess: () => {
          toast.success(`Session for "${deleteTarget.domain}" cleared.`);
          setDeleteTarget(null);
        },
        onError: () => {
          toast.error("Failed to clear session.");
        },
      },
    );
  }

  if (query.isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="py-12 text-center text-sm text-[var(--wk-status-error)]">
        Failed to load sessions. Please try refreshing.
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="py-12 text-center">
        <Globe className="mx-auto h-10 w-10 text-[var(--wk-text-tertiary)]" />
        <p className="mt-3 text-sm font-medium text-[var(--wk-text-primary)]">
          No browser sessions
        </p>
        <p className="mt-1 text-sm text-[var(--wk-text-secondary)]">
          Sessions will appear here once Valet logs into sites on your behalf.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--wk-border-subtle)]">
              <th className="pb-3 pr-4 text-left font-medium text-[var(--wk-text-secondary)]">
                Domain
              </th>
              <th className="pb-3 pr-4 text-left font-medium text-[var(--wk-text-secondary)]">
                Last Used
              </th>
              <th className="pb-3 pr-4 text-left font-medium text-[var(--wk-text-secondary)]">
                Created
              </th>
              <th className="pb-3 text-right font-medium text-[var(--wk-text-secondary)]">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--wk-border-subtle)]">
            {sessions.map((session) => (
              <tr
                key={session.id}
                className="group hover:bg-[var(--wk-surface-raised)] transition-colors"
              >
                <td className="py-3 pr-4">
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-[var(--wk-text-tertiary)] shrink-0" />
                    <span className="font-medium text-[var(--wk-text-primary)]">
                      {session.domain}
                    </span>
                  </div>
                </td>
                <td className="py-3 pr-4 text-[var(--wk-text-secondary)]">
                  {session.lastUsedAt
                    ? formatDistanceToNow(new Date(session.lastUsedAt), {
                        addSuffix: true,
                      })
                    : "Never"}
                </td>
                <td className="py-3 pr-4 text-[var(--wk-text-secondary)]">
                  {format(new Date(session.createdAt), "MMM d, yyyy")}
                </td>
                <td className="py-3 text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-[var(--wk-status-error)] hover:text-[var(--wk-status-error)]"
                    onClick={() => setDeleteTarget(session)}
                  >
                    <Trash2 className="h-4 w-4" />
                    Clear
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Clear confirmation dialog */}
      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Clear Session</DialogTitle>
            <DialogDescription>
              Are you sure you want to clear the session for{" "}
              <span className="font-medium text-[var(--wk-text-primary)]">
                {deleteTarget?.domain}
              </span>
              ? You may need to log in again on this site.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleClear} disabled={clearMutation.isPending}>
              {clearMutation.isPending ? (
                <>
                  <LoadingSpinner size="sm" />
                  Clearing...
                </>
              ) : (
                "Clear Session"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
