import { Badge } from "@valet/ui/components/badge";
import { Button } from "@valet/ui/components/button";
import { Skeleton } from "@valet/ui/components/skeleton";
import { Container, AlertCircle, RefreshCw } from "lucide-react";
import { useAgentContainers } from "../hooks/use-sandboxes";

const stateVariant: Record<string, "success" | "warning" | "error" | "default"> = {
  running: "success",
  created: "default",
  restarting: "warning",
  exited: "error",
};

interface SandboxContainersTabProps {
  sandboxId: string;
}

export function SandboxContainersTab({ sandboxId }: SandboxContainersTabProps) {
  const { data, isLoading, isError, refetch } = useAgentContainers(sandboxId);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (isError || (data && data.status !== 200)) {
    return (
      <div className="py-8 text-center space-y-3">
        <AlertCircle className="mx-auto h-8 w-8 text-[var(--wk-status-error)]" />
        <p className="text-sm text-[var(--wk-text-secondary)]">
          Agent unreachable. The sandbox may be stopped or the agent is not running.
        </p>
        <Button variant="secondary" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4" />
          Retry
        </Button>
      </div>
    );
  }

  const containers = data?.status === 200 ? data.body.data : [];

  if (containers.length === 0) {
    return (
      <div className="py-8 text-center">
        <Container className="mx-auto h-8 w-8 text-[var(--wk-text-tertiary)]" />
        <p className="mt-2 text-sm text-[var(--wk-text-secondary)]">
          No containers found on this sandbox.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--wk-border-subtle)]">
            <th className="pb-2 pr-4 text-left font-medium text-[var(--wk-text-secondary)]">
              Name
            </th>
            <th className="pb-2 pr-4 text-left font-medium text-[var(--wk-text-secondary)]">
              Image
            </th>
            <th className="pb-2 pr-4 text-left font-medium text-[var(--wk-text-secondary)]">
              State
            </th>
            <th className="pb-2 pr-4 text-left font-medium text-[var(--wk-text-secondary)]">
              Status
            </th>
            <th className="pb-2 pr-4 text-left font-medium text-[var(--wk-text-secondary)]">
              Ports
            </th>
            <th className="pb-2 text-left font-medium text-[var(--wk-text-secondary)]">Created</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--wk-border-subtle)]">
          {containers.map((c) => (
            <tr key={c.id} className="hover:bg-[var(--wk-surface-raised)] transition-colors">
              <td className="py-2.5 pr-4 font-mono text-xs">{c.name}</td>
              <td className="py-2.5 pr-4 font-mono text-xs text-[var(--wk-text-secondary)] max-w-[200px] truncate">
                {c.image}
              </td>
              <td className="py-2.5 pr-4">
                <Badge variant={stateVariant[c.state] ?? "default"} className="capitalize">
                  {c.state}
                </Badge>
              </td>
              <td className="py-2.5 pr-4 text-[var(--wk-text-secondary)] text-xs">{c.status}</td>
              <td className="py-2.5 pr-4 font-mono text-xs text-[var(--wk-text-secondary)]">
                {c.ports.length > 0 ? c.ports.join(", ") : "-"}
              </td>
              <td className="py-2.5 text-xs text-[var(--wk-text-secondary)]">{c.createdAt}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
