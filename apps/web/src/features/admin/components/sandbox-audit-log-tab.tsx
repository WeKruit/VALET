import { useState } from "react";
import { Badge } from "@valet/ui/components/badge";
import { Button } from "@valet/ui/components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@valet/ui/components/select";
import { Skeleton } from "@valet/ui/components/skeleton";
import { ScrollText } from "lucide-react";
import { formatRelativeTime } from "@/lib/utils";
import { useAuditLog } from "../hooks/use-sandboxes";

const ALL = "__all__";

const actionVariant: Record<string, "success" | "warning" | "error" | "default" | "info"> = {
  deploy: "info",
  start: "success",
  stop: "warning",
  terminate: "error",
  health_check: "default",
  set_env: "info",
  delete_env: "warning",
  exec: "warning",
  drain: "warning",
  start_worker: "success",
  stop_worker: "error",
  build: "info",
  restart_service: "warning",
};

const resultVariant: Record<string, "success" | "error" | "default"> = {
  success: "success",
  failure: "error",
  error: "error",
};

interface SandboxAuditLogTabProps {
  sandboxId: string;
}

export function SandboxAuditLogTab({ sandboxId }: SandboxAuditLogTabProps) {
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState(ALL);

  const { data, isLoading } = useAuditLog(sandboxId, {
    page,
    pageSize: 20,
    ...(actionFilter !== ALL ? { action: actionFilter } : {}),
  });

  const body = data?.status === 200 ? data.body : null;
  const entries = body?.data ?? [];
  const pagination = body?.pagination;

  if (isLoading && !body) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Action filter */}
      <div className="flex items-center gap-3">
        <Select
          value={actionFilter}
          onValueChange={(v) => {
            setActionFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by action" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All Actions</SelectItem>
            <SelectItem value="deploy">Deploy</SelectItem>
            <SelectItem value="start">Start</SelectItem>
            <SelectItem value="stop">Stop</SelectItem>
            <SelectItem value="terminate">Terminate</SelectItem>
            <SelectItem value="set_env">Set Env</SelectItem>
            <SelectItem value="exec">Exec</SelectItem>
            <SelectItem value="drain">Drain</SelectItem>
            <SelectItem value="health_check">Health Check</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {entries.length === 0 ? (
        <div className="py-8 text-center">
          <ScrollText className="mx-auto h-8 w-8 text-[var(--wk-text-tertiary)]" />
          <p className="mt-2 text-sm text-[var(--wk-text-secondary)]">
            No audit log entries found.
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--wk-border-subtle)]">
                  <th className="pb-2 pr-4 text-left font-medium text-[var(--wk-text-secondary)]">
                    Time
                  </th>
                  <th className="pb-2 pr-4 text-left font-medium text-[var(--wk-text-secondary)]">
                    Action
                  </th>
                  <th className="pb-2 pr-4 text-left font-medium text-[var(--wk-text-secondary)]">
                    Result
                  </th>
                  <th className="pb-2 pr-4 text-left font-medium text-[var(--wk-text-secondary)]">
                    Duration
                  </th>
                  <th className="pb-2 text-left font-medium text-[var(--wk-text-secondary)]">
                    Details
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--wk-border-subtle)]">
                {entries.map((entry) => (
                  <tr
                    key={entry.id}
                    className="hover:bg-[var(--wk-surface-raised)] transition-colors"
                  >
                    <td className="py-2.5 pr-4 text-xs text-[var(--wk-text-secondary)] whitespace-nowrap">
                      {formatRelativeTime(entry.createdAt)}
                    </td>
                    <td className="py-2.5 pr-4">
                      <Badge variant={actionVariant[entry.action] ?? "default"}>
                        {entry.action.replace(/_/g, " ")}
                      </Badge>
                    </td>
                    <td className="py-2.5 pr-4">
                      {entry.result && (
                        <Badge variant={resultVariant[entry.result] ?? "default"}>
                          {entry.result}
                        </Badge>
                      )}
                    </td>
                    <td className="py-2.5 pr-4 text-xs text-[var(--wk-text-secondary)] tabular-nums">
                      {entry.durationMs != null ? `${entry.durationMs}ms` : "-"}
                    </td>
                    <td className="py-2.5 text-xs text-[var(--wk-text-tertiary)] max-w-[300px] truncate">
                      {entry.errorMessage ?? (entry.details ? JSON.stringify(entry.details) : "-")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-[var(--wk-border-subtle)] pt-3">
              <p className="text-xs text-[var(--wk-text-secondary)]">
                Page {pagination.page} of {pagination.totalPages} ({pagination.total} entries)
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
                  disabled={page >= pagination.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
