import { Link } from "react-router-dom";
import { Card, CardContent } from "@valet/ui/components/card";
import { Badge } from "@valet/ui/components/badge";
import { ExternalLink } from "lucide-react";
import { formatRelativeTime } from "@/lib/utils";

interface TaskItem {
  id: string;
  jobUrl: string;
  platform: string;
  status: string;
  mode: "copilot" | "autopilot";
  progress: number;
  currentStep: string | null;
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
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex items-center gap-4">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate max-w-xs">
                      {task.jobUrl}
                    </span>
                    <ExternalLink className="h-3 w-3 text-[var(--wk-text-tertiary)]" />
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="default">{task.platform}</Badge>
                    <Badge
                      variant={
                        task.mode === "copilot" ? "copilot" : "autopilot"
                      }
                    >
                      {task.mode}
                    </Badge>
                    <span className="text-xs text-[var(--wk-text-tertiary)]">
                      {formatRelativeTime(task.createdAt)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
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
                <Badge variant={statusBadgeVariant[task.status] ?? "default"}>
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
