import { Server } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@valet/ui/components/select";
import { Badge } from "@valet/ui/components/badge";
import { Card, CardContent } from "@valet/ui/components/card";
import { LoadingSpinner } from "@/components/common/loading-spinner";
import { useSandboxes } from "@/features/admin/hooks/use-sandboxes";
import type { SandboxHealthStatus } from "@valet/shared/schemas";

const HEALTH_VARIANT: Record<SandboxHealthStatus, "success" | "warning" | "error"> = {
  healthy: "success",
  degraded: "warning",
  unhealthy: "error",
};

interface WorkerSelectorProps {
  value: string;
  onChange: (value: string) => void;
}

/**
 * Admin-only selector that allows targeting a specific sandbox/worker.
 * Fetches active sandboxes and displays them with health status indicators.
 *
 * value="" means "Auto (any available)" -- no targetWorkerId sent.
 */
export function WorkerSelector({ value, onChange }: WorkerSelectorProps) {
  const { data, isLoading } = useSandboxes({
    status: "active",
    pageSize: 50,
    sortBy: "name",
    sortOrder: "asc",
  });

  const sandboxes = data?.status === 200 ? data.body.data : [];

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center gap-2 mb-3">
          <Server className="h-4 w-4 text-[var(--wk-text-secondary)]" />
          <label className="text-sm font-medium text-[var(--wk-text-primary)]">
            Target Worker
            <span className="font-normal text-[var(--wk-text-tertiary)] ml-1">(optional)</span>
          </label>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-[var(--wk-text-secondary)]">
            <LoadingSpinner size="sm" />
            Loading workers...
          </div>
        ) : (
          <>
            <Select value={value} onValueChange={onChange}>
              <SelectTrigger>
                <SelectValue placeholder="Auto (any available)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto (any available)</SelectItem>
                {sandboxes.map((sandbox) => (
                  <SelectItem key={sandbox.id} value={sandbox.id}>
                    <div className="flex items-center gap-2">
                      <span>{sandbox.name}</span>
                      <Badge
                        variant={HEALTH_VARIANT[sandbox.healthStatus]}
                        className="text-[10px] px-1.5 py-0"
                      >
                        {sandbox.healthStatus}
                      </Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-[var(--wk-text-tertiary)] mt-1.5">
              Route this task to a specific worker, or leave on Auto to use any available worker.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
