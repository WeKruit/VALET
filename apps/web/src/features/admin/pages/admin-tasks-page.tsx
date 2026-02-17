import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@valet/ui/components/card";
import { Button } from "@valet/ui/components/button";
import { Input } from "@valet/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@valet/ui/components/select";
import { ClipboardList, RefreshCw, Search } from "lucide-react";
import { AdminTaskTable } from "../components/admin-task-table";
import { useAdminTasks } from "../hooks/use-admin-tasks";

const ALL = "__all__";

export function AdminTasksPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(ALL);
  const [page, setPage] = useState(1);

  const query = useAdminTasks({
    page,
    pageSize: 25,
    ...(search ? { search } : {}),
    ...(statusFilter !== ALL ? { status: statusFilter } : {}),
    sortBy: "createdAt",
    sortOrder: "desc",
  });

  const tasks = query.data?.data ?? [];
  const total = query.data?.pagination?.total ?? 0;
  const totalPages = query.data?.pagination?.totalPages ?? 1;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-display font-semibold text-[var(--wk-text-primary)]">
            Tasks
          </h1>
          <p className="mt-1 text-sm text-[var(--wk-text-secondary)]">
            View and manage all application tasks across users
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={() => query.refetch()} title="Refresh">
          <RefreshCw className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--wk-text-tertiary)]" />
              <Input
                placeholder="Search by job title, company, or URL..."
                className="pl-9"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <Select
              value={statusFilter}
              onValueChange={(v) => {
                setStatusFilter(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Task Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All Statuses</SelectItem>
                <SelectItem value="created">Created</SelectItem>
                <SelectItem value="queued">Queued</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="waiting_human">Waiting Human</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            All Tasks
            {total > 0 && (
              <span className="text-sm font-normal text-[var(--wk-text-secondary)]">({total})</span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <AdminTaskTable tasks={tasks} isLoading={query.isLoading} isError={query.isError} />

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between border-t border-[var(--wk-border-subtle)] pt-4">
              <p className="text-sm text-[var(--wk-text-secondary)]">
                Page {page} of {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
