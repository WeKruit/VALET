import { Card, CardContent, CardHeader, CardTitle } from "@valet/ui/components/card";
import {
  Activity,
  ArrowLeftRight,
  Brain,
  CheckCircle2,
  Circle,
  Coins,
  DollarSign,
  Eye,
  XCircle,
} from "lucide-react";
import { useTaskEvents } from "../hooks/use-task-events";
import { cn } from "@/lib/utils";

interface ActivityFeedProps {
  taskId: string;
  isTerminal: boolean;
}

const eventIconMap: Record<string, { icon: typeof Circle; color: string }> = {
  step_started: { icon: CheckCircle2, color: "text-[var(--wk-status-success)]" },
  step_completed: { icon: CheckCircle2, color: "text-[var(--wk-status-success)]" },
  cookbook_step_started: { icon: CheckCircle2, color: "text-[var(--wk-status-success)]" },
  cookbook_step_completed: { icon: CheckCircle2, color: "text-[var(--wk-status-success)]" },
  cookbook_step_failed: { icon: XCircle, color: "text-[var(--wk-status-error)]" },
  thought: { icon: Brain, color: "text-[var(--wk-text-tertiary)]" },
  tokens_used: { icon: Coins, color: "text-[var(--wk-accent-amber)]" },
  observation_started: { icon: Eye, color: "text-[var(--wk-text-secondary)]" },
  observation_completed: { icon: Eye, color: "text-[var(--wk-text-secondary)]" },
  mode_switched: { icon: ArrowLeftRight, color: "text-[var(--wk-status-warning)]" },
  job_started: { icon: Activity, color: "text-[var(--wk-copilot)]" },
  job_completed: { icon: Activity, color: "text-[var(--wk-status-success)]" },
  job_failed: { icon: Activity, color: "text-[var(--wk-status-error)]" },
};

function getEventIcon(eventType: string | null) {
  if (!eventType) return { icon: Circle, color: "text-[var(--wk-text-tertiary)]" };
  return eventIconMap[eventType] ?? { icon: Circle, color: "text-[var(--wk-text-tertiary)]" };
}

function formatRelativeToStart(eventTime: string, startTime: string | null): string {
  if (!startTime) return new Date(eventTime).toLocaleTimeString();
  const diffMs = new Date(eventTime).getTime() - new Date(startTime).getTime();
  if (diffMs < 0) return "0s";
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return `+${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `+${minutes}m ${remainingSeconds}s`;
}

function getModeStyle(mode: string | null | undefined): {
  bg: string;
  text: string;
  label: string;
} {
  if (!mode) return { bg: "bg-gray-100", text: "text-gray-700", label: "Unknown" };
  const lower = mode.toLowerCase();
  if (lower === "cookbook" || lower === "cookbook_only") {
    return { bg: "bg-emerald-50", text: "text-emerald-700", label: "Cookbook" };
  }
  if (lower === "magnitude" || lower === "ai_only" || lower === "ai") {
    return { bg: "bg-blue-50", text: "text-blue-700", label: "AI Agent" };
  }
  if (lower === "hybrid" || lower === "auto") {
    return { bg: "bg-amber-50", text: "text-amber-700", label: "Hybrid" };
  }
  return { bg: "bg-gray-100", text: "text-gray-700", label: mode };
}

export function ActivityFeed({ taskId, isTerminal }: ActivityFeedProps) {
  const { data, isLoading } = useTaskEvents(taskId, true);
  const events = data?.events ?? [];

  if (isLoading && events.length === 0) {
    return null;
  }

  if (events.length === 0) {
    return null;
  }

  // Derive execution mode + final mode from events metadata
  const jobStartEvent = events.find((e) => e.eventType === "job_started");
  const modeSwitchEvent = events.find((e) => e.eventType === "mode_switched");
  const executionMode = (jobStartEvent?.metadata?.executionMode as string) ?? null;
  const finalMode = (modeSwitchEvent?.metadata?.toMode as string) ?? null;
  const startTime = jobStartEvent?.createdAt ?? events[0]?.createdAt ?? null;

  // Derive running cost from the latest tokens_used event or job_completed
  const costEvents = events.filter(
    (e) => e.eventType === "tokens_used" || e.eventType === "job_completed",
  );
  const latestCostEvent = costEvents[costEvents.length - 1];
  const runningCost = (latestCostEvent?.metadata?.totalCostUsd as number) ?? null;

  const modeStyle = getModeStyle(executionMode);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-[var(--wk-text-secondary)]" />
            <CardTitle className="text-lg">Activity</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {/* Mode Indicator */}
            {executionMode && (
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-[var(--wk-radius-full)] px-2.5 py-0.5 text-xs font-medium",
                  modeStyle.bg,
                  modeStyle.text,
                )}
              >
                {modeStyle.label}
                {finalMode && finalMode !== executionMode && (
                  <span className="opacity-70"> &rarr; {getModeStyle(finalMode).label}</span>
                )}
              </span>
            )}
            {!isTerminal && (
              <span className="flex items-center gap-1 text-xs text-[var(--wk-text-tertiary)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--wk-status-success)] animate-pulse" />
                Live
              </span>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Timeline */}
        <div className="max-h-80 overflow-y-auto space-y-1 pr-1">
          {events.map((event) => {
            const { icon: Icon, color } = getEventIcon(event.eventType);
            const isThought = event.eventType === "thought";
            const isModeSwitched = event.eventType === "mode_switched";
            const isTokens = event.eventType === "tokens_used";

            let displayMessage = event.message ?? event.eventType ?? "Event";
            if (isThought && displayMessage.length > 200) {
              displayMessage = displayMessage.slice(0, 200) + "...";
            }

            return (
              <div
                key={event.id}
                className={cn(
                  "flex items-start gap-2.5 rounded-[var(--wk-radius-md)] px-2.5 py-1.5 text-sm transition-colors",
                  isModeSwitched && "bg-amber-50/50 dark:bg-amber-950/10",
                )}
              >
                <Icon className={cn("h-4 w-4 shrink-0 mt-0.5", color)} />
                <div className="flex-1 min-w-0">
                  <p
                    className={cn(
                      "text-sm leading-snug",
                      isThought && "italic text-[var(--wk-text-tertiary)]",
                      !isThought && "text-[var(--wk-text-primary)]",
                    )}
                  >
                    {displayMessage}
                  </p>
                  {isTokens && event.metadata && (
                    <p className="text-xs text-[var(--wk-text-tertiary)] mt-0.5">
                      {(event.metadata.model as string) ?? "model"} &middot;{" "}
                      {(event.metadata.tokens as number) ?? 0} tokens
                    </p>
                  )}
                </div>
                <span className="text-[10px] text-[var(--wk-text-tertiary)] tabular-nums shrink-0 mt-0.5">
                  {formatRelativeToStart(event.createdAt, startTime)}
                </span>
              </div>
            );
          })}
        </div>

        {/* Live Cost Footer */}
        {runningCost != null && (
          <div className="flex items-center gap-1.5 pt-2 border-t border-[var(--wk-border-subtle)]">
            <DollarSign className="h-3.5 w-3.5 text-[var(--wk-text-tertiary)]" />
            <span className="text-xs text-[var(--wk-text-secondary)]">
              Running cost:{" "}
              <span className="font-medium text-[var(--wk-text-primary)]">
                ${runningCost.toFixed(4)}
              </span>
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
