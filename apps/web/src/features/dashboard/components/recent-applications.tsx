import { Link } from "react-router-dom";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@valet/ui/components/card";
import { Badge } from "@valet/ui/components/badge";
import { Button } from "@valet/ui/components/button";
import {
  CheckCircle,
  Clock,
  XCircle,
  AlertCircle,
  Ban,
  Inbox,
  ArrowRight,
} from "lucide-react";
import { useTasks } from "@/features/tasks/hooks/use-tasks";
import { formatDistanceToNow } from "date-fns";
import { LoadingSpinner } from "@/components/common/loading-spinner";

const statusConfig: Record<
  string,
  {
    icon: React.ElementType;
    variant: "default" | "success" | "warning" | "error" | "info";
    label: string;
  }
> = {
  created: { icon: Clock, variant: "default", label: "Created" },
  queued: { icon: Clock, variant: "default", label: "Queued" },
  in_progress: { icon: Clock, variant: "info", label: "In Progress" },
  waiting_human: {
    icon: AlertCircle,
    variant: "warning",
    label: "Needs Review",
  },
  completed: { icon: CheckCircle, variant: "success", label: "Completed" },
  failed: { icon: XCircle, variant: "error", label: "Failed" },
  cancelled: { icon: Ban, variant: "default", label: "Cancelled" },
};

export function RecentApplications() {
  const { data, isLoading, isError } = useTasks({ page: 1 });
  const tasks = data?.status === 200 ? data.body.data.slice(0, 5) : [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Recent Applications</CardTitle>
          {tasks.length > 0 && (
            <Link
              to="/tasks"
              className="flex items-center gap-1 text-xs font-medium text-[var(--wk-text-secondary)] hover:text-[var(--wk-text-primary)] transition-colors"
            >
              View All
              <ArrowRight className="h-3 w-3" />
            </Link>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <LoadingSpinner />
          </div>
        ) : isError ? (
          <div className="py-8 text-center text-sm text-[var(--wk-status-error)]">
            Failed to load recent applications. Please try refreshing.
          </div>
        ) : tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-[var(--wk-radius-2xl)] bg-[var(--wk-surface-sunken)]">
              <Inbox className="h-6 w-6 text-[var(--wk-text-tertiary)]" />
            </div>
            <h3 className="mt-4 font-display text-lg font-semibold">
              No applications yet
            </h3>
            <p className="mt-1 max-w-xs text-sm text-[var(--wk-text-secondary)]">
              Your completed applications will appear here with status and
              timestamps.
            </p>
            <Button asChild variant="primary" size="sm" className="mt-4">
              <Link to="/apply">Start your first application</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {tasks.map((task) => {
              const config = statusConfig[task.status] ?? {
                icon: Clock,
                variant: "default" as const,
                label: task.status,
              };
              const StatusIcon = config.icon;

              return (
                <Link
                  key={task.id}
                  to={`/tasks/${task.id}`}
                  className="flex items-center justify-between rounded-[var(--wk-radius-lg)] p-3 hover:bg-[var(--wk-surface-sunken)] transition-colors"
                >
                  <div className="flex flex-col gap-1 min-w-0">
                    <span className="text-sm font-medium truncate">
                      {task.jobUrl}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[var(--wk-text-tertiary)]">
                        {task.platform}
                      </span>
                      <span className="text-[var(--wk-text-tertiary)]">
                        &middot;
                      </span>
                      <span className="text-xs text-[var(--wk-text-tertiary)]">
                        {formatDistanceToNow(new Date(task.createdAt), {
                          addSuffix: true,
                        })}
                      </span>
                      {task.completedAt && (
                        <>
                          <span className="text-[var(--wk-text-tertiary)]">
                            &middot;
                          </span>
                          <span className="text-xs text-[var(--wk-text-tertiary)]">
                            Finished{" "}
                            {formatDistanceToNow(new Date(task.completedAt), {
                              addSuffix: true,
                            })}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <Badge
                    variant={config.variant}
                    className="flex items-center gap-1 shrink-0 ml-3"
                  >
                    <StatusIcon className="h-3 w-3" />
                    {config.label}
                  </Badge>
                </Link>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
