import { useParams, Link } from "react-router-dom";
import { Button } from "@valet/ui/components/button";
import { Card, CardContent } from "@valet/ui/components/card";
import { TaskDetail } from "../components/task-detail";
import { ArrowLeft, FileQuestion } from "lucide-react";

export function TaskDetailPage() {
  const { taskId } = useParams<{ taskId: string }>();

  if (!taskId) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link to="/tasks">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            Task Not Found
          </h1>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-[var(--wk-radius-2xl)] bg-[var(--wk-surface-sunken)]">
              <FileQuestion className="h-6 w-6 text-[var(--wk-text-tertiary)]" />
            </div>
            <h3 className="mt-4 font-display text-lg font-semibold">
              Task not found
            </h3>
            <p className="mt-1 max-w-sm text-sm text-[var(--wk-text-secondary)]">
              This task may have been deleted or the URL is incorrect.
            </p>
            <Link to="/tasks" className="mt-4">
              <Button variant="secondary">Back to Tasks</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/tasks">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          Application Progress
        </h1>
      </div>

      <TaskDetail taskId={taskId} />
    </div>
  );
}
