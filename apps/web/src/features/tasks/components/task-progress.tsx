import { Card, CardContent, CardHeader, CardTitle } from "@valet/ui/components/card";
import { Check, Circle, Loader2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceStrict } from "date-fns";

const steps = [
  { id: "queued", label: "Queued", description: "Task created" },
  { id: "starting", label: "Starting", description: "Launching browser" },
  { id: "navigating", label: "Navigating", description: "Opening job page" },
  { id: "analyzing", label: "Analyzing", description: "Reading form fields" },
  { id: "filling", label: "Filling", description: "Entering data" },
  { id: "review", label: "Review", description: "Waiting for approval" },
  {
    id: "submitting",
    label: "Submitting",
    description: "Sending application",
  },
  { id: "done", label: "Done", description: "Application submitted" },
];

function progressToStepIndex(progress: number): number {
  if (progress >= 95) return 7;
  if (progress >= 85) return 6;
  if (progress >= 75) return 5;
  if (progress >= 50) return 4;
  if (progress >= 30) return 3;
  if (progress >= 15) return 2;
  if (progress >= 6) return 1;
  return 0;
}

interface TaskProgressProps {
  progress?: number;
  status?: string;
  createdAt?: Date | string;
  completedAt?: Date | string | null;
}

export function TaskProgress({ progress = 0, status, createdAt, completedAt }: TaskProgressProps) {
  const isFailed = status === "failed";
  const isCancelled = status === "cancelled";

  let currentIndex: number;
  if (status === "completed") {
    currentIndex = steps.length;
  } else if (status === "created" || status === "queued") {
    currentIndex = 0;
  } else {
    currentIndex = progressToStepIndex(progress);
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Progress</CardTitle>
          {createdAt && completedAt && (
            <span className="text-xs text-[var(--wk-text-secondary)]">
              Total: {formatDistanceStrict(new Date(completedAt), new Date(createdAt))}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-0">
          {steps.map((step, index) => {
            const isComplete = index < currentIndex;
            const isCurrent = index === currentIndex;
            const isPending = index > currentIndex;
            const isErrorStep = isCurrent && (isFailed || isCancelled);

            return (
              <div key={step.id} className="flex gap-4">
                {/* Timeline connector */}
                <div className="flex flex-col items-center">
                  <div
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-300",
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
                      <Check className="h-4 w-4" />
                    ) : isErrorStep ? (
                      <AlertTriangle className="h-4 w-4" />
                    ) : isCurrent ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Circle className="h-3 w-3" />
                    )}
                  </div>
                  {index < steps.length - 1 && (
                    <div
                      className={cn(
                        "h-8 w-0.5 transition-colors duration-300",
                        isComplete
                          ? "bg-[var(--wk-status-success)]"
                          : "bg-[var(--wk-border-default)]",
                      )}
                    />
                  )}
                </div>

                {/* Content */}
                <div className="flex items-start pb-4 pt-1 flex-1 min-w-0">
                  <div>
                    <p
                      className={cn(
                        "text-sm font-medium",
                        isPending && "text-[var(--wk-text-tertiary)]",
                        isErrorStep && "text-[var(--wk-status-error)]",
                      )}
                    >
                      {step.label}
                    </p>
                    <p className="text-xs text-[var(--wk-text-secondary)]">{step.description}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
