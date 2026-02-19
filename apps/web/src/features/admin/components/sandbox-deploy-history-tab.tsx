import { useState } from "react";
import { Badge } from "@valet/ui/components/badge";
import { Button } from "@valet/ui/components/button";
import { Skeleton } from "@valet/ui/components/skeleton";
import { Rocket } from "lucide-react";
import { formatRelativeTime } from "@/lib/utils";
import { useDeployHistory } from "../hooks/use-sandboxes";

const statusVariant: Record<string, "success" | "warning" | "error" | "default" | "info"> = {
  pending: "default",
  deploying: "info",
  completed: "success",
  failed: "error",
  rolled_back: "warning",
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

interface SandboxDeployHistoryTabProps {
  sandboxId: string;
}

export function SandboxDeployHistoryTab({ sandboxId }: SandboxDeployHistoryTabProps) {
  const [page, setPage] = useState(1);

  const { data, isLoading } = useDeployHistory(sandboxId, { page, pageSize: 20 });

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

  if (entries.length === 0) {
    return (
      <div className="py-8 text-center">
        <Rocket className="mx-auto h-8 w-8 text-[var(--wk-text-tertiary)]" />
        <p className="mt-2 text-sm text-[var(--wk-text-secondary)]">No deploy history found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--wk-border-subtle)]">
              <th className="pb-2 pr-4 text-left font-medium text-[var(--wk-text-secondary)]">
                Image Tag
              </th>
              <th className="pb-2 pr-4 text-left font-medium text-[var(--wk-text-secondary)]">
                Commit
              </th>
              <th className="pb-2 pr-4 text-left font-medium text-[var(--wk-text-secondary)]">
                Branch
              </th>
              <th className="pb-2 pr-4 text-left font-medium text-[var(--wk-text-secondary)]">
                Status
              </th>
              <th className="pb-2 pr-4 text-left font-medium text-[var(--wk-text-secondary)]">
                Duration
              </th>
              <th className="pb-2 text-left font-medium text-[var(--wk-text-secondary)]">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--wk-border-subtle)]">
            {entries.map((entry) => (
              <tr key={entry.id} className="hover:bg-[var(--wk-surface-raised)] transition-colors">
                <td className="py-2.5 pr-4 font-mono text-xs">{entry.imageTag}</td>
                <td className="py-2.5 pr-4 font-mono text-xs text-[var(--wk-text-secondary)]">
                  {entry.commitSha ? entry.commitSha.slice(0, 7) : "-"}
                </td>
                <td className="py-2.5 pr-4 text-xs text-[var(--wk-text-secondary)]">
                  {entry.branch ?? "-"}
                </td>
                <td className="py-2.5 pr-4">
                  <Badge variant={statusVariant[entry.status] ?? "default"} className="capitalize">
                    {entry.status.replace(/_/g, " ")}
                  </Badge>
                </td>
                <td className="py-2.5 pr-4 text-xs text-[var(--wk-text-secondary)] tabular-nums">
                  {formatDuration(entry.deployDurationMs)}
                </td>
                <td className="py-2.5 text-xs text-[var(--wk-text-secondary)]">
                  {formatRelativeTime(entry.createdAt)}
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
    </div>
  );
}
