import { Badge } from "@valet/ui/components/badge";

const machineTypeConfig: Record<
  string,
  { label: string; variant: "info" | "copilot" | "default" }
> = {
  ec2: { label: "EC2", variant: "info" },
  macos: { label: "macOS", variant: "copilot" },
  local_docker: { label: "Local", variant: "default" },
};

interface MachineTypeBadgeProps {
  machineType?: string | null;
}

export function MachineTypeBadge({ machineType }: MachineTypeBadgeProps) {
  const type = machineType ?? "ec2";
  const config = machineTypeConfig[type] ?? { label: type, variant: "default" as const };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
