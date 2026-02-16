import { Link } from "react-router-dom";
import { Card, CardContent } from "@valet/ui/components/card";
import { Badge } from "@valet/ui/components/badge";
import { ExternalLink, AlertTriangle } from "lucide-react";
import { formatRelativeTime } from "@/lib/utils";

interface TaskItem {
  id: string;
  jobUrl: string;
  jobTitle?: string | null;
  companyName?: string | null;
  platform: string;
  status: string;
  externalStatus?: string | null;
  mode: "copilot" | "autopilot";
  progress: number;
  currentStep?: string | null;
  createdAt: Date;
}

interface TaskListProps {
  tasks: TaskItem[];
}

const statusBadgeVariant: Record<string, "default" | "success" | "warning" | "error" | "info"> = {
  created: "default",
  queued: "default",
  in_progress: "info",
  waiting_human: "warning",
  completed: "success",
  failed: "error",
  cancelled: "default",
};

const externalStatusBadgeVariant: Record<
  string,
  "default" | "success" | "warning" | "error" | "info"
> = {
  applied: "info",
  viewed: "default",
  interview: "warning",
  rejected: "error",
  offer: "success",
  ghosted: "default",
};

export function TaskList({ tasks }: TaskListProps) {
  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <h3 className="font-display text-lg font-semibold">No tasks yet</h3>
        <p className="mt-1 text-sm text-[var(--wk-text-secondary)]">
          Start by applying to a job on the Apply page.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {tasks.map((task) => (
        <Link key={task.id} to={`/tasks/${task.id}`}>
          <Card className="hover:shadow-[var(--wk-shadow-md)] transition-shadow cursor-pointer">
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4 min-w-0">
                <div className="flex flex-col gap-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">
                      {task.jobTitle ?? task.jobUrl}
                    </span>
                    {task.companyName && (
                      <span className="text-sm text-[var(--wk-text-secondary)] truncate">
                        at {task.companyName}
                      </span>
                    )}
                    <ExternalLink className="h-3 w-3 shrink-0 text-[var(--wk-text-tertiary)]" />
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="default">{task.platform}</Badge>
                    <Badge variant={task.mode === "copilot" ? "copilot" : "autopilot"}>
                      {task.mode}
                    </Badge>
                    {task.externalStatus && (
                      <Badge variant={externalStatusBadgeVariant[task.externalStatus] ?? "default"}>
                        {task.externalStatus}
                      </Badge>
                    )}
                    <span className="text-xs text-[var(--wk-text-tertiary)]">
                      {formatRelativeTime(task.createdAt)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                {task.status === "in_progress" && (
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-24 rounded-full bg-[var(--wk-surface-sunken)]">
                      <div
                        className="h-full rounded-full bg-[var(--wk-copilot)] transition-all"
                        style={{ width: `${task.progress}%` }}
                      />
                    </div>
                    <span className="text-xs text-[var(--wk-text-secondary)]">
                      {task.progress}%
                    </span>
                  </div>
                )}
                {task.status === "waiting_human" && (
                  <AlertTriangle className="h-4 w-4 text-[var(--wk-status-warning)]" />
                )}
                <Badge
                  variant={statusBadgeVariant[task.status] ?? "default"}
                  className={task.status === "waiting_human" ? "animate-pulse" : ""}
                >
                  {task.status.replace("_", " ")}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
