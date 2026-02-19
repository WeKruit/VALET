import { Card, CardContent } from "@valet/ui/components/card";
import { Server, Play, Square, HeartPulse } from "lucide-react";
import type { Sandbox } from "../types";

interface SummaryCardsProps {
  sandboxes: Sandbox[];
}

export function SummaryCards({ sandboxes }: SummaryCardsProps) {
  const total = sandboxes.length;
  const running = sandboxes.filter((s) => s.ec2Status === "running").length;
  const stopped = sandboxes.filter((s) => s.ec2Status === "stopped").length;
  const healthy = sandboxes.filter((s) => s.healthStatus === "healthy").length;

  const cards = [
    {
      label: "Total",
      value: total,
      icon: Server,
      color: "text-[var(--wk-text-primary)]",
      bg: "bg-[var(--wk-surface-sunken)]",
    },
    {
      label: "Running",
      value: running,
      icon: Play,
      color: "text-[var(--wk-status-success)]",
      bg: "bg-[color-mix(in_srgb,var(--wk-status-success)_8%,transparent)]",
    },
    {
      label: "Stopped",
      value: stopped,
      icon: Square,
      color: "text-[var(--wk-text-secondary)]",
      bg: "bg-[var(--wk-surface-sunken)]",
    },
    {
      label: "Healthy",
      value: healthy,
      icon: HeartPulse,
      color: "text-[var(--wk-status-success)]",
      bg: "bg-[color-mix(in_srgb,var(--wk-status-success)_8%,transparent)]",
    },
  ] as const;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.label}>
          <CardContent className="py-3 px-4 flex items-center gap-3">
            <div
              className={`flex h-9 w-9 items-center justify-center rounded-[var(--wk-radius-md)] ${card.bg}`}
            >
              <card.icon className={`h-4 w-4 ${card.color}`} />
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums text-[var(--wk-text-primary)]">
                {card.value}
              </p>
              <p className="text-xs text-[var(--wk-text-tertiary)]">{card.label}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
