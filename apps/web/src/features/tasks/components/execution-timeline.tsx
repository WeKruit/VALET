import { Card, CardContent, CardHeader, CardTitle } from "@valet/ui/components/card";
import { Badge } from "@valet/ui/components/badge";
import type { Circle } from "lucide-react";
import {
  Check,
  Loader2,
  AlertTriangle,
  Clock,
  Zap,
  Navigation,
  Search,
  FileText,
  Upload,
  HelpCircle,
  Eye,
  Send,
  ClipboardCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSSEEvents } from "../hooks/use-sse-events";

/** Maps GH ProgressStep values to display info. */
const STEP_CONFIG: Record<string, { label: string; icon: typeof Circle; description: string }> = {
  queued: {
    label: "Queued",
    icon: Clock,
    description: "Waiting in queue",
  },
  initializing: {
    label: "Starting",
    icon: Zap,
    description: "Launching browser agent",
  },
  navigating: {
    label: "Navigating",
    icon: Navigation,
    description: "Opening application page",
  },
  analyzing_page: {
    label: "Analyzing",
    icon: Search,
    description: "Reading page structure",
  },
  filling_form: {
    label: "Filling Form",
    icon: FileText,
    description: "Entering application data",
  },
  uploading_resume: {
    label: "Uploading Resume",
    icon: Upload,
    description: "Attaching resume file",
  },
  answering_questions: {
    label: "Answering Questions",
    icon: HelpCircle,
    description: "Responding to screening questions",
  },
  reviewing: {
    label: "Reviewing",
    icon: Eye,
    description: "Checking submission",
  },
  submitting: {
    label: "Submitting",
    icon: Send,
    description: "Sending application",
  },
  extracting_results: {
    label: "Extracting Results",
    icon: ClipboardCheck,
    description: "Capturing confirmation",
  },
  completed: {
    label: "Complete",
    icon: Check,
    description: "Application submitted",
  },
  failed: {
    label: "Failed",
    icon: AlertTriangle,
    description: "Execution failed",
  },
};

const STEP_ORDER = [
  "queued",
  "initializing",
  "navigating",
  "analyzing_page",
  "filling_form",
  "uploading_resume",
  "answering_questions",
  "reviewing",
  "submitting",
  "extracting_results",
  "completed",
];

function formatDuration(ms: number): string {
  if (ms < 1000) return "<1s";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function formatETA(ms: number | null): string | null {
  if (ms === null || ms <= 0) return null;
  const seconds = Math.ceil(ms / 1000);
  if (seconds < 60) return `~${seconds}s remaining`;
  const minutes = Math.ceil(seconds / 60);
  return `~${minutes}m remaining`;
}

interface ExecutionTimelineProps {
  taskId: string;
  /** Whether the task is in a terminal state (completed/failed/cancelled). */
  isTerminal: boolean;
  /** Task status from the API. */
  taskStatus?: string;
}

export function ExecutionTimeline({ taskId, isTerminal, taskStatus }: ExecutionTimelineProps) {
  const { latestEvent, status: sseStatus } = useSSEEvents(taskId, !isTerminal);

  // If no SSE data yet and task is terminal, don't render (ActivityFeed handles it)
  if (!latestEvent && isTerminal) return null;

  // If SSE not connected yet and no data, show minimal state
  if (!latestEvent) {
    if (sseStatus === "connecting") {
      return (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-[var(--wk-text-secondary)]" />
              <CardTitle className="text-lg">Execution Progress</CardTitle>
              <Badge variant="default" className="text-[10px] px-1.5">
                Connecting...
              </Badge>
            </div>
          </CardHeader>
        </Card>
      );
    }
    return null;
  }

  const currentStep = latestEvent.step;
  const currentStepIndex = STEP_ORDER.indexOf(currentStep);
  const isFailed = currentStep === "failed" || taskStatus === "failed";
  const eta = formatETA(latestEvent.eta_ms);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-[var(--wk-copilot)]" />
            <CardTitle className="text-lg">Execution Progress</CardTitle>
            {sseStatus === "connected" && !isTerminal && (
              <span className="flex items-center gap-1 text-xs text-[var(--wk-text-tertiary)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--wk-status-success)] animate-pulse" />
                Live
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* ETA badge */}
            {eta && !isTerminal && (
              <span className="text-xs text-[var(--wk-text-secondary)]">{eta}</span>
            )}
            {/* Elapsed time */}
            <span className="text-xs text-[var(--wk-text-tertiary)] tabular-nums">
              {formatDuration(latestEvent.elapsed_ms)}
            </span>
            {/* Progress percentage */}
            <Badge variant={currentStep === "completed" ? "success" : isFailed ? "error" : "info"}>
              {latestEvent.progress_pct}%
            </Badge>
          </div>
        </div>
        {/* Progress bar */}
        <div className="mt-2 h-1.5 w-full rounded-full bg-[var(--wk-surface-sunken)] overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-700 ease-out",
              isFailed
                ? "bg-[var(--wk-status-error)]"
                : "bg-gradient-to-r from-[var(--wk-copilot)] to-[var(--wk-accent-teal)]",
            )}
            style={{ width: `${latestEvent.progress_pct}%` }}
          />
        </div>
      </CardHeader>
      <CardContent>
        {/* Current action (what the agent is doing right now) */}
        {latestEvent.current_action && !isTerminal && (
          <div className="mb-4 rounded-[var(--wk-radius-md)] bg-[var(--wk-surface-sunken)] px-3 py-2">
            <p className="text-xs text-[var(--wk-text-secondary)] mb-0.5">Agent is thinking...</p>
            <p className="text-sm text-[var(--wk-text-primary)] italic line-clamp-2">
              {latestEvent.current_action}
            </p>
          </div>
        )}

        {/* Step timeline */}
        <div className="space-y-0">
          {STEP_ORDER.filter((s) => s !== "completed").map((stepId, index) => {
            const config = STEP_CONFIG[stepId];
            if (!config) return null;

            const isComplete = currentStepIndex > index;
            const isCurrent = stepId === currentStep;
            const isPending = currentStepIndex < index;
            const isErrorStep = isCurrent && isFailed;
            const StepIcon = config.icon;

            return (
              <div key={stepId} className="flex gap-3">
                {/* Timeline dot + connector */}
                <div className="flex flex-col items-center">
                  <div
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-500",
                      isComplete &&
                        "border-[var(--wk-status-success)] bg-[var(--wk-status-success)] text-white",
                      isCurrent &&
                        !isErrorStep &&
                        "border-[var(--wk-copilot)] bg-[var(--wk-copilot)] text-white",
                      isErrorStep &&
                        "border-[var(--wk-status-error)] bg-[var(--wk-status-error)] text-white",
                      isPending &&
                        "border-[var(--wk-border-default)] bg-[var(--wk-surface-page)] text-[var(--wk-text-tertiary)]",
                      isCurrent && !isErrorStep && "animate-pulse",
                    )}
                  >
                    {isComplete ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : isErrorStep ? (
                      <AlertTriangle className="h-3.5 w-3.5" />
                    ) : isCurrent ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <StepIcon className="h-3 w-3" />
                    )}
                  </div>
                  {index < STEP_ORDER.length - 2 && (
                    <div
                      className={cn(
                        "h-6 w-0.5 transition-colors duration-500",
                        isComplete
                          ? "bg-[var(--wk-status-success)]"
                          : "bg-[var(--wk-border-default)]",
                      )}
                    />
                  )}
                </div>

                {/* Label */}
                <div className="flex items-center pb-3 pt-0.5 flex-1 min-w-0">
                  <div className="flex-1 min-w-0">
                    <p
                      className={cn(
                        "text-sm font-medium leading-tight",
                        isPending && "text-[var(--wk-text-tertiary)]",
                        isErrorStep && "text-[var(--wk-status-error)]",
                        isCurrent && !isErrorStep && "text-[var(--wk-text-primary)]",
                        isComplete && "text-[var(--wk-text-primary)]",
                      )}
                    >
                      {config.label}
                    </p>
                    {(isCurrent || isComplete) && (
                      <p className="text-[11px] text-[var(--wk-text-tertiary)] leading-tight mt-0.5">
                        {config.description}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Execution mode badge */}
        {latestEvent.execution_mode && (
          <div className="mt-3 pt-3 border-t border-[var(--wk-border-subtle)] flex items-center gap-2">
            <span className="text-xs text-[var(--wk-text-tertiary)]">Mode:</span>
            <Badge
              variant={latestEvent.execution_mode === "cookbook" ? "success" : "info"}
              className="text-[10px] px-1.5"
            >
              {latestEvent.execution_mode === "cookbook" ? "Cookbook" : "AI Agent"}
            </Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
