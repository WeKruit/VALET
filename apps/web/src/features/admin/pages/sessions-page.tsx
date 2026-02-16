import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@valet/ui/components/card";
import { Button } from "@valet/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@valet/ui/components/dialog";
import { Globe, Trash2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { LoadingSpinner } from "@/components/common/loading-spinner";
import { SessionTable } from "../components/session-table";
import { useSessions, useClearAllSessions } from "../hooks/use-sessions";

export function SessionsPage() {
  const [clearAllOpen, setClearAllOpen] = useState(false);
  const query = useSessions();
  const clearAllMutation = useClearAllSessions();

  const sessionCount = query.data?.status === 200 ? query.data.body.count : 0;

  function handleClearAll() {
    clearAllMutation.mutate(
      { body: {} },
      {
        onSuccess: (res) => {
          if (res.status === 200) {
            toast.success(
              `Cleared ${res.body.deletedCount} session${res.body.deletedCount === 1 ? "" : "s"}.`,
            );
          }
          setClearAllOpen(false);
        },
        onError: () => {
          toast.error("Failed to clear sessions.");
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
            Browser Sessions
          </h1>
          <p className="mt-1 text-sm text-[var(--wk-text-secondary)]">
            Manage saved login sessions for automated applications
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => query.refetch()} title="Refresh">
            <RefreshCw className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />
          </Button>
          {sessionCount > 0 && (
            <Button variant="destructive" onClick={() => setClearAllOpen(true)}>
              <Trash2 className="h-4 w-4" />
              Clear All Sessions
            </Button>
          )}
        </div>
      </div>

      {/* Sessions Table */}
      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="text-base flex items-center gap-2">
            <Globe className="h-4 w-4" />
            Sessions
            {sessionCount > 0 && (
              <span className="text-sm font-normal text-[var(--wk-text-secondary)]">
                ({sessionCount})
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <SessionTable />
        </CardContent>
      </Card>

      {/* Clear All confirmation dialog */}
      <Dialog open={clearAllOpen} onOpenChange={setClearAllOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Clear All Sessions</DialogTitle>
            <DialogDescription>
              Are you sure you want to clear all {sessionCount} browser session
              {sessionCount === 1 ? "" : "s"}? You will need to log in again on all sites during
              future applications.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setClearAllOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleClearAll}
              disabled={clearAllMutation.isPending}
            >
              {clearAllMutation.isPending ? (
                <>
                  <LoadingSpinner size="sm" />
                  Clearing...
                </>
              ) : (
                "Clear All"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
