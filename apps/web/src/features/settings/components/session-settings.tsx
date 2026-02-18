import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@valet/ui/components/card";
import { Button } from "@valet/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@valet/ui/components/dialog";
import { Badge } from "@valet/ui/components/badge";
import { Globe, Trash2, AlertTriangle } from "lucide-react";
import { LoadingSpinner } from "@/components/common/loading-spinner";
import { useSessions, useClearSession, useClearAllSessions } from "../hooks/use-sessions";
import { formatDistanceToNow } from "date-fns";

export function SessionSettings() {
  const { data, isLoading, isError } = useSessions();
  const clearSession = useClearSession();
  const clearAllSessions = useClearAllSessions();
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [confirmDomain, setConfirmDomain] = useState<string | null>(null);

  const sessions = data?.status === 200 ? data.body.sessions : [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Browser Sessions</CardTitle>
            <p className="text-sm text-[var(--wk-text-secondary)] mt-1">
              Active login sessions used by VALET for your applications.
            </p>
          </div>
          {sessions.length > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setConfirmClearAll(true)}
              disabled={clearAllSessions.isPending}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear All
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <LoadingSpinner />
          </div>
        ) : isError ? (
          <p className="text-sm text-[var(--wk-status-error)] py-4 text-center">
            Failed to load sessions.
          </p>
        ) : sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-[var(--wk-radius-2xl)] bg-[var(--wk-surface-sunken)]">
              <Globe className="h-6 w-6 text-[var(--wk-text-tertiary)]" />
            </div>
            <h3 className="mt-4 font-display text-lg font-semibold">No sessions</h3>
            <p className="mt-1 max-w-xs text-sm text-[var(--wk-text-secondary)]">
              Sessions will appear here after VALET logs into platforms on your behalf.
            </p>
          </div>
        ) : (
          <>
            {/* Header row */}
            <div className="hidden md:grid grid-cols-[1fr_1fr_1fr_80px] gap-3 px-3 py-2 text-xs font-medium uppercase tracking-wider text-[var(--wk-text-secondary)]">
              <span>Domain</span>
              <span>Created</span>
              <span>Last Used</span>
              <span>Actions</span>
            </div>

            <div className="space-y-1">
              {sessions.map((session) => (
                <div
                  key={session.domain}
                  className="rounded-[var(--wk-radius-md)] px-3 py-2.5 hover:bg-[var(--wk-surface-sunken)] transition-colors"
                >
                  {/* Desktop */}
                  <div className="hidden md:grid grid-cols-[1fr_1fr_1fr_80px] gap-3 items-center">
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4 text-[var(--wk-text-tertiary)] shrink-0" />
                      <span className="text-sm font-medium truncate">{session.domain}</span>
                    </div>
                    <span className="text-sm text-[var(--wk-text-secondary)]">
                      {formatDistanceToNow(new Date(session.createdAt), {
                        addSuffix: true,
                      })}
                    </span>
                    <span className="text-sm text-[var(--wk-text-secondary)]">
                      {session.lastUsedAt
                        ? formatDistanceToNow(new Date(session.lastUsedAt), {
                            addSuffix: true,
                          })
                        : "Never"}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmDomain(session.domain)}
                      disabled={clearSession.isPending}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-[var(--wk-status-error)]" />
                    </Button>
                  </div>

                  {/* Mobile */}
                  <div className="md:hidden space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Globe className="h-4 w-4 text-[var(--wk-text-tertiary)]" />
                        <span className="text-sm font-medium">{session.domain}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmDomain(session.domain)}
                        disabled={clearSession.isPending}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-[var(--wk-status-error)]" />
                      </Button>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-[var(--wk-text-secondary)]">
                      <span>
                        Created{" "}
                        {formatDistanceToNow(new Date(session.createdAt), {
                          addSuffix: true,
                        })}
                      </span>
                      <Badge variant="default" className="text-[10px]">
                        {session.lastUsedAt
                          ? `Used ${formatDistanceToNow(new Date(session.lastUsedAt), { addSuffix: true })}`
                          : "Never used"}
                      </Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>

      {/* Confirm clear single session */}
      <Dialog
        open={confirmDomain != null}
        onOpenChange={(open) => {
          if (!open) setConfirmDomain(null);
        }}
      >
        <DialogContent>
          <DialogTitle>Clear Session</DialogTitle>
          <DialogDescription>
            Are you sure you want to clear the session for <strong>{confirmDomain}</strong>? You
            will need to log in again on next use.
          </DialogDescription>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDomain(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={clearSession.isPending}
              onClick={() => {
                if (confirmDomain) {
                  clearSession.mutate(
                    { params: { domain: confirmDomain }, body: {} },
                    { onSettled: () => setConfirmDomain(null) },
                  );
                }
              }}
            >
              {clearSession.isPending ? "Clearing..." : "Clear Session"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm clear all sessions */}
      <Dialog
        open={confirmClearAll}
        onOpenChange={(open) => {
          if (!open) setConfirmClearAll(false);
        }}
      >
        <DialogContent>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[var(--wk-radius-lg)] bg-red-50 dark:bg-red-950/30">
              <AlertTriangle className="h-5 w-5 text-[var(--wk-status-error)]" />
            </div>
            <div>
              <DialogTitle>Clear All Sessions</DialogTitle>
              <DialogDescription>
                This will remove all {sessions.length} saved login sessions. You will need to
                re-authenticate on each platform.
              </DialogDescription>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmClearAll(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={clearAllSessions.isPending}
              onClick={() => {
                clearAllSessions.mutate(
                  { body: {} },
                  { onSettled: () => setConfirmClearAll(false) },
                );
              }}
            >
              {clearAllSessions.isPending ? "Clearing..." : "Clear All Sessions"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
