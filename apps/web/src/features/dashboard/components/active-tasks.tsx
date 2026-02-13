import { Link } from "react-router-dom";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@valet/ui/components/card";
import { Badge } from "@valet/ui/components/badge";
import { Button } from "@valet/ui/components/button";
import { FileSearch, ArrowRight } from "lucide-react";
import { useTasks } from "@/features/tasks/hooks/use-tasks";
import { formatDistanceToNow } from "date-fns";
import { LoadingSpinner } from "@/components/common/loading-spinner";

const platformColors: Record<string, string> = {
  linkedin: "bg-blue-50 text-blue-700 border-blue-200",
  greenhouse: "bg-emerald-50 text-emerald-700 border-emerald-200",
  lever: "bg-teal-50 text-teal-700 border-teal-200",
  workday: "bg-orange-50 text-orange-700 border-orange-200",
  unknown: "bg-gray-50 text-gray-600 border-gray-200",
};

export function ActiveTasks() {
  const { data, isLoading, isError } = useTasks({ status: "in_progress" });
  const activeTasks = data?.status === 200 ? data.body.data : [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Active Tasks</CardTitle>
          {activeTasks.length > 0 && (
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
            Failed to load active tasks. Please try refreshing.
          </div>
        ) : activeTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-[var(--wk-radius-2xl)] bg-[var(--wk-surface-sunken)]">
              <FileSearch className="h-6 w-6 text-[var(--wk-text-tertiary)]" />
            </div>
            <h3 className="mt-4 font-display text-lg font-semibold">
              No active tasks
            </h3>
            <p className="mt-1 max-w-xs text-sm text-[var(--wk-text-secondary)]">
              Start your first application to see live progress here.
            </p>
            <Button asChild variant="primary" size="sm" className="mt-4">
              <Link to="/apply">Start your first application</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {activeTasks.map((task) => (
              <Link
                key={task.id}
                to={`/tasks/${task.id}`}
                className="flex items-center justify-between rounded-[var(--wk-radius-lg)] p-3 hover:bg-[var(--wk-surface-sunken)] transition-colors"
              >
                <div className="flex flex-col gap-1.5 min-w-0">
                  <span className="text-sm font-medium truncate">
                    {task.jobUrl}
                  </span>
                  <div className="flex items-center gap-2">
                    <Badge
                      className={`text-[10px] px-1.5 py-0 border ${platformColors[task.platform] ?? platformColors.unknown}`}
                    >
                      {task.platform}
                    </Badge>
                    <span className="text-xs text-[var(--wk-text-tertiary)]">
                      {formatDistanceToNow(new Date(task.createdAt), {
                        addSuffix: true,
                      })}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-3">
                  <div className="h-2 w-20 rounded-full bg-[var(--wk-surface-sunken)] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[var(--wk-copilot)] to-[var(--wk-accent-teal)] transition-all duration-500"
                      style={{ width: `${task.progress}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium text-[var(--wk-text-secondary)] w-8 text-right">
                    {task.progress}%
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
