import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@valet/ui/components/button";
import { TaskList } from "../components/task-list";
import { LoadingSpinner } from "@/components/common/loading-spinner";
import { useTasks } from "../hooks/use-tasks";
import { Plus } from "lucide-react";

export function TasksPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useTasks({ page });

  const tasks = data?.status === 200 ? data.body.data : [];
  const pagination = data?.status === 200 ? data.body.pagination : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-semibold text-[var(--wk-text-primary)]">
            Applications
          </h1>
          <p className="mt-1 text-sm text-[var(--wk-text-secondary)]">
            Track and manage all your job applications
          </p>
        </div>
        <Button asChild variant="primary">
          <Link to="/apply">
            <Plus className="mr-1 h-4 w-4" />
            New Application
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      ) : (
        <>
          <TaskList tasks={tasks} />
          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <Button
                variant="ghost"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <span className="text-sm text-[var(--wk-text-secondary)]">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <Button
                variant="ghost"
                size="sm"
                disabled={page >= pagination.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
