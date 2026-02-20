import { Card, CardContent, CardHeader, CardTitle } from "@valet/ui/components/card";
import { Badge } from "@valet/ui/components/badge";
import {
  Check,
  Circle,
  Loader2,
  AlertTriangle,
  Rocket,
  Globe,
  FileSearch,
  FormInput,
  PenLine,
  Eye,
  Send,
  CheckCircle2,
  XCircle,
  ShieldAlert,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceStrict } from "date-fns";
import { useMemo } from "react";

export interface GhJobEvent {
  id: string;
  eventType: string | null;
  fromStatus: string | null;
  toStatus: string | null;
  message: string | null;
  metadata: Record<string, unknown> | null;
  actor: string | null;
  createdAt: string;
}

export interface TaskTimelineProps {
  events: GhJobEvent[];
  task: {
    status: string;
    progress?: number;
    createdAt: Date | string;
    completedAt?: Date | string | null;
  };
}

interface Milestone {
  id: string;
  label: string;
  description: string;
  icon: typeof Circle;
  matchEvents: string[];
}

const MILESTONES: Milestone[] = [
  {
    id: "queued",
    label: "Queued",
    description: "Task created and waiting",
    icon: Clock,
    matchEvents: [],
  },
  {
    id: "started",
    label: "Job Started",
    description: "Worker picked up the job",
    icon: Rocket,
    matchEvents: ["job_started"],
  },
  {
    id: "browser",
    label: "Browser Ready",
    description: "Chromium launched",
    icon: Globe,
    matchEvents: ["browser_launched"],
  },
  {
    id: "navigated",
    label: "Page Loaded",
    description: "Navigated to target URL",
    icon: Globe,
    matchEvents: ["page_navigated"],
  },
  {
    id: "form",
    label: "Form Analyzed",
    description: "Detected form fields",
    icon: FileSearch,
    matchEvents: ["form_detected"],
  },
  {
    id: "filling",
    label: "Filling Fields",
    description: "Entering application data",
    icon: PenLine,
    matchEvents: ["step_started", "cookbook_step_started"],
  },
  {
    id: "fields_complete",
    label: "Fields Complete",
    description: "All fields filled",
    icon: FormInput,
    matchEvents: ["step_completed", "cookbook_step_completed"],
  },
  {
    id: "review",
    label: "Review",
    description: "Verifying filled data",
    icon: Eye,
    matchEvents: ["observation_started", "mode_switched"],
  },
  {
    id: "submitting",
    label: "Submitting",
    description: "Sending application",
    icon: Send,
    matchEvents: ["step_started"],
  },
  {
    id: "terminal",
    label: "Completed",
    description: "Application submitted",
    icon: CheckCircle2,
    matchEvents: ["job_completed", "job_failed"],
  },
];

export interface ResolvedStep {
  milestone: Milestone;
  status: "complete" | "current" | "pending" | "error" | "warning";
  timestamp: string | null;
  detail: string | null;
}

export function resolveSteps(
  events: GhJobEvent[],
  task: TaskTimelineProps["task"],
): ResolvedStep[] {
  const resolved: ResolvedStep[] = [];
  const firstByType = new Map<string, GhJobEvent>();
  const lastByType = new Map<string, GhJobEvent>();
  for (const ev of events) {
    if (!ev.eventType) continue;
    if (!firstByType.has(ev.eventType)) firstByType.set(ev.eventType, ev);
    lastByType.set(ev.eventType, ev);
  }
  const blockerEvent = firstByType.get("blocker_detected") ?? firstByType.get("hitl_paused");

  for (const milestone of MILESTONES) {
    if (milestone.id === "queued") {
      resolved.push({
        milestone,
        status: "complete",
        timestamp:
          typeof task.createdAt === "string" ? task.createdAt : task.createdAt.toISOString(),
        detail: null,
      });
      continue;
    }
    if (milestone.id === "fields_complete") {
      const ev = lastByType.get("step_completed") ?? lastByType.get("cookbook_step_completed");
      if (ev) {
        resolved.push({
          milestone,
          status: "complete",
          timestamp: ev.createdAt,
          detail: ev.message,
        });
        continue;
      }
    }
    if (milestone.id === "filling") {
      const ev = firstByType.get("step_started") ?? firstByType.get("cookbook_step_started");
      if (ev) {
        resolved.push({
          milestone,
          status: "complete",
          timestamp: ev.createdAt,
          detail: ev.message,
        });
        continue;
      }
    }
    if (milestone.id === "submitting") {
      const lc = lastByType.get("step_completed") ?? lastByType.get("cookbook_step_completed");
      if (lc) {
        const t = new Date(lc.createdAt).getTime();
        const sub = events.find(
          (e) =>
            (e.eventType === "step_started" || e.eventType === "cookbook_step_started") &&
            new Date(e.createdAt).getTime() > t,
        );
        if (sub) {
          resolved.push({
            milestone,
            status: "complete",
            timestamp: sub.createdAt,
            detail: sub.message,
          });
          continue;
        }
      }
    }
    if (milestone.id === "terminal") {
      const completed = firstByType.get("job_completed");
      const failed = firstByType.get("job_failed");
      if (completed) {
        resolved.push({
          milestone: { ...milestone, label: "Completed", icon: CheckCircle2 },
          status: "complete",
          timestamp: completed.createdAt,
          detail: completed.message,
        });
        continue;
      }
      if (failed) {
        resolved.push({
          milestone: { ...milestone, label: "Failed", icon: XCircle },
          status: "error",
          timestamp: failed.createdAt,
          detail: failed.message ?? (failed.metadata?.error as string) ?? null,
        });
        continue;
      }
      if (task.status === "failed") {
        resolved.push({
          milestone: { ...milestone, label: "Failed", icon: XCircle },
          status: "error",
          timestamp: task.completedAt
            ? typeof task.completedAt === "string"
              ? task.completedAt
              : task.completedAt.toISOString()
            : null,
          detail: null,
        });
        continue;
      }
      if (task.status === "cancelled") {
        resolved.push({
          milestone: { ...milestone, label: "Cancelled", icon: XCircle },
          status: "error",
          timestamp: null,
          detail: null,
        });
        continue;
      }
    }
    if (!["fields_complete", "filling", "submitting", "terminal"].includes(milestone.id)) {
      let m: GhJobEvent | undefined;
      for (const t of milestone.matchEvents) {
        m = firstByType.get(t);
        if (m) break;
      }
      if (m) {
        resolved.push({ milestone, status: "complete", timestamp: m.createdAt, detail: m.message });
        continue;
      }
    }
    resolved.push({ milestone, status: "pending", timestamp: null, detail: null });
  }

  if (["in_progress", "queued", "created", "waiting_human"].includes(task.status)) {
    const p = resolved.find((s) => s.status === "pending");
    if (p) p.status = "current";
  }
  if (blockerEvent) {
    const idx = resolved.reduce((a, s, i) => (s.status === "complete" ? i : a), -1);
    resolved.splice(idx + 1, 0, {
      milestone: {
        id: "hitl",
        label: "HITL Pause",
        description: blockerEvent.message ?? "Human intervention required",
        icon: ShieldAlert,
        matchEvents: [],
      },
      status: task.status === "waiting_human" ? "warning" : "complete",
      timestamp: blockerEvent.createdAt,
      detail:
        (blockerEvent.metadata?.blockerType as string) ??
        (blockerEvent.metadata?.type as string) ??
        blockerEvent.message,
    });
  }
  return resolved;
}

function formatDuration(from: string, to: string): string {
  const d = new Date(to).getTime() - new Date(from).getTime();
  if (d < 0) return "";
  const s = Math.floor(d / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return rs > 0 ? `${m}m ${rs}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
}

function formatAbsoluteTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

export function TaskTimeline({ events, task }: TaskTimelineProps) {
  const steps = useMemo(() => resolveSteps(events, task), [events, task]);
  const isTerminal =
    task.status === "completed" || task.status === "cancelled" || task.status === "failed";
  const totalDuration = useMemo(() => {
    if (!task.createdAt) return null;
    const end = task.completedAt ? new Date(task.completedAt) : isTerminal ? null : new Date();
    if (!end) return null;
    return formatDistanceStrict(end, new Date(task.createdAt));
  }, [task.createdAt, task.completedAt, isTerminal]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Timeline</CardTitle>
          <div className="flex items-center gap-2">
            {!isTerminal && (
              <span className="flex items-center gap-1 text-xs text-[var(--wk-text-tertiary)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--wk-status-success)] animate-pulse" />
                Live
              </span>
            )}
            {totalDuration && (
              <span className="text-xs text-[var(--wk-text-secondary)]">
                Total: {totalDuration}
              </span>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-0">
          {steps.map((step, index) => {
            const isLast = index === steps.length - 1;
            const prevTs = index > 0 ? steps[index - 1]?.timestamp : null;
            const dur = prevTs && step.timestamp ? formatDuration(prevTs, step.timestamp) : null;
            return (
              <div key={step.milestone.id} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-300",
                      step.status === "complete" &&
                        "border-[var(--wk-status-success)] bg-[var(--wk-status-success)] text-white",
                      step.status === "current" &&
                        "border-[var(--wk-copilot)] bg-[var(--wk-copilot)] text-white animate-pulse",
                      step.status === "error" &&
                        "border-[var(--wk-status-error)] bg-[var(--wk-status-error)] text-white",
                      step.status === "warning" &&
                        "border-[var(--wk-status-warning)] bg-[var(--wk-status-warning)] text-white",
                      step.status === "pending" &&
                        "border-[var(--wk-border-default)] bg-[var(--wk-surface-page)] text-[var(--wk-text-tertiary)]",
                    )}
                  >
                    {step.status === "complete" ? (
                      <Check className="h-4 w-4" />
                    ) : step.status === "current" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : step.status === "error" ? (
                      <XCircle className="h-4 w-4" />
                    ) : step.status === "warning" ? (
                      <AlertTriangle className="h-4 w-4" />
                    ) : (
                      <Circle className="h-3 w-3" />
                    )}
                  </div>
                  {!isLast && (
                    <div
                      className={cn(
                        "h-8 w-0.5 transition-colors duration-300",
                        step.status === "complete" || step.status === "warning"
                          ? "bg-[var(--wk-status-success)]"
                          : step.status === "error"
                            ? "bg-[var(--wk-status-error)]"
                            : "bg-[var(--wk-border-default)]",
                      )}
                    />
                  )}
                </div>
                <div className="flex items-start pb-4 pt-1 flex-1 min-w-0 justify-between">
                  <div className="min-w-0">
                    <p
                      className={cn(
                        "text-sm font-medium",
                        step.status === "pending" && "text-[var(--wk-text-tertiary)]",
                        step.status === "error" && "text-[var(--wk-status-error)]",
                        step.status === "warning" && "text-[var(--wk-status-warning)]",
                      )}
                    >
                      {step.milestone.label}
                    </p>
                    <p className="text-xs text-[var(--wk-text-secondary)]">
                      {step.detail ?? step.milestone.description}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    {dur && (
                      <Badge variant="default" className="text-[10px] font-normal px-1.5 py-0">
                        {dur}
                      </Badge>
                    )}
                    {step.timestamp && (
                      <span
                        className="text-[10px] text-[var(--wk-text-tertiary)] tabular-nums"
                        title={new Date(step.timestamp).toLocaleString()}
                      >
                        {formatAbsoluteTime(step.timestamp)}
                      </span>
                    )}
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
