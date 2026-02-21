import { Badge } from "@valet/ui/components/badge";
import type { SandboxStatus } from "../types";

const statusConfig: Record<
  SandboxStatus,
  { label: string; variant: "success" | "warning" | "error" | "default" | "info" }
> = {
  active: { label: "Active", variant: "success" },
  provisioning: { label: "Provisioning", variant: "info" },
  stopping: { label: "Stopping", variant: "warning" },
  stopped: { label: "Stopped", variant: "default" },
  terminated: { label: "Terminated", variant: "default" },
  unhealthy: { label: "Unhealthy", variant: "error" },
};

interface SandboxStatusBadgeProps {
  status: SandboxStatus;
}

export function SandboxStatusBadge({ status }: SandboxStatusBadgeProps) {
  const config = statusConfig[status] ?? { label: status, variant: "default" as const };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
