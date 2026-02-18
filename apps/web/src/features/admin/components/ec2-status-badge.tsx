import { Badge } from "@valet/ui/components/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@valet/ui/components/tooltip";
import { Play, Square, Loader2 } from "lucide-react";
import type { Ec2Status } from "../types";

const statusConfig: Record<
  Ec2Status,
  {
    label: string;
    variant: "success" | "warning" | "error" | "default";
    Icon: typeof Play;
    tooltip: string;
  }
> = {
  running: {
    label: "Running",
    variant: "success",
    Icon: Play,
    tooltip: "Instance is running (~$0.042/hr)",
  },
  stopped: {
    label: "Stopped",
    variant: "default",
    Icon: Square,
    tooltip: "Instance is stopped (EBS storage only)",
  },
  pending: {
    label: "Starting",
    variant: "warning",
    Icon: Loader2,
    tooltip: "Instance is starting up...",
  },
  stopping: {
    label: "Stopping",
    variant: "warning",
    Icon: Loader2,
    tooltip: "Instance is shutting down...",
  },
  terminated: {
    label: "Terminated",
    variant: "error",
    Icon: Square,
    tooltip: "Instance has been terminated",
  },
};

interface Ec2StatusBadgeProps {
  status: Ec2Status | null | undefined;
  className?: string;
}

export function Ec2StatusBadge({ status, className }: Ec2StatusBadgeProps) {
  if (!status) {
    return (
      <Badge variant="default" className={className}>
        Unknown
      </Badge>
    );
  }

  const config = statusConfig[status] ?? {
    label: status,
    variant: "default" as const,
    Icon: Square,
    tooltip: "",
  };
  const { Icon } = config;
  const isTransitional = status === "pending" || status === "stopping";

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="inline-flex">
            <Badge variant={config.variant} className={`gap-1 ${className ?? ""}`}>
              <Icon
                className={`h-3 w-3 ${isTransitional ? "animate-spin" : ""}`}
              />
              {config.label}
            </Badge>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>{config.tooltip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
