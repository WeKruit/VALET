import { Badge } from "@valet/ui/components/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@valet/ui/components/tooltip";
import { Heart, HeartPulse, HeartOff } from "lucide-react";
import { formatRelativeTime } from "@/lib/utils";
import type { SandboxHealthStatus } from "../types";

const healthConfig: Record<
  SandboxHealthStatus,
  {
    label: string;
    variant: "success" | "warning" | "error";
    Icon: typeof Heart;
  }
> = {
  healthy: { label: "Healthy", variant: "success", Icon: Heart },
  degraded: { label: "Degraded", variant: "warning", Icon: HeartPulse },
  unhealthy: { label: "Unhealthy", variant: "error", Icon: HeartOff },
};

interface SandboxHealthIndicatorProps {
  healthStatus: SandboxHealthStatus;
  lastCheckAt: Date | string | null | undefined;
}

export function SandboxHealthIndicator({
  healthStatus,
  lastCheckAt,
}: SandboxHealthIndicatorProps) {
  const config = healthConfig[healthStatus] ?? healthConfig.unhealthy;
  const { Icon } = config;

  const checkStr = lastCheckAt
    ? formatRelativeTime(
        typeof lastCheckAt === "string" ? lastCheckAt : lastCheckAt.toISOString(),
      )
    : "Never";

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="inline-flex items-center gap-1.5">
            <Badge variant={config.variant} className="gap-1">
              <Icon className="h-3 w-3" />
              {config.label}
            </Badge>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>Last checked: {checkStr}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
