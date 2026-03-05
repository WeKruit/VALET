import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@valet/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@valet/ui/components/dialog";
import { Plus, Inbox } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { JobLeadList } from "../components/job-lead-list";
import { JobLeadDetail } from "../components/job-lead-detail";
import { ImportJobDialog } from "../components/import-job-dialog";
import type { JobLead } from "@valet/shared/schemas";
import { useDebounce } from "@/hooks/use-debounce";

const PAGE_SIZE = 30;

export function JobsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Filters
  const [statusFilter, setStatusFilter] = useState("all");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 300);
  const [offset, setOffset] = useState(0);

  // UI state
  const [selectedLead, setSelectedLead] = useState<JobLead | null>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<JobLead | null>(null);

  // Query
  const { data, isLoading } = api.jobLeads.list.useQuery({
    queryKey: ["job-leads", statusFilter, platformFilter, debouncedSearch, offset],
    queryData: {
      query: {
        status: statusFilter === "all" ? undefined : (statusFilter as any),
        platform: platformFilter === "all" ? undefined : (platformFilter as any),
        search: debouncedSearch || undefined,
        limit: PAGE_SIZE,
        offset,
      },
    },
    staleTime: 1000 * 60 * 2,
  });

  const leads: JobLead[] = data?.status === 200 ? (data.body.data as JobLead[]) : [];
  const total = data?.status === 200 ? data.body.total : 0;
  const hasMore = offset + PAGE_SIZE < total;

  // Mutations
  const queueMutation = api.jobLeads.queueForApplication.useMutation({
    onSuccess: (res) => {
      if (res.status === 200) {
        toast.success("Job queued for application.");
        queryClient.invalidateQueries({ queryKey: ["job-leads"] });
        setSelectedLead(null);
      }
    },
    onError: () => {
      toast.error("Failed to queue job. Please try again.");
    },
  });

  const deleteMutation = api.jobLeads.delete.useMutation({
    onSuccess: () => {
      toast.success("Job deleted.");
      queryClient.invalidateQueries({ queryKey: ["job-leads"] });
      if (selectedLead?.id === deleteTarget?.id) setSelectedLead(null);
      setDeleteTarget(null);
    },
    onError: () => {
      toast.error("Failed to delete job. Please try again.");
    },
  });

  // Handlers
  const handleSelect = useCallback((lead: JobLead) => {
    setSelectedLead(lead);
  }, []);

  const handleQueue = useCallback(
    (lead: JobLead) => {
      queueMutation.mutate({
        params: { id: lead.id },
        body: {},
      });
    },
    [queueMutation],
  );

  const handleEdit = useCallback((_lead: JobLead) => {
    // TODO: open edit dialog
    toast.info("Edit coming soon.");
  }, []);

  const handleDelete = useCallback((lead: JobLead) => {
    setDeleteTarget(lead);
  }, []);

  const confirmDelete = useCallback(() => {
    if (deleteTarget) {
      deleteMutation.mutate({
        params: { id: deleteTarget.id },
        body: {},
      });
    }
  }, [deleteTarget, deleteMutation]);

  const handleStatusChange = useCallback((status: string) => {
    setStatusFilter(status);
    setOffset(0);
  }, []);

  const handlePlatformChange = useCallback((platform: string) => {
    setPlatformFilter(platform);
    setOffset(0);
  }, []);

  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query);
    setOffset(0);
  }, []);

  const handleLoadMore = useCallback(() => {
    setOffset((prev) => prev + PAGE_SIZE);
  }, []);

  const handleViewTask = useCallback(
    (taskId: string) => {
      navigate(`/tasks/${taskId}`);
    },
    [navigate],
  );

  return (
    <div className="flex h-[calc(100vh-64px)] flex-col">
      {/* Page header */}
      <div className="flex items-center justify-between border-b border-[var(--wk-border-subtle)] px-6 py-4">
        <div className="flex items-center gap-3">
          <Inbox className="h-5 w-5 text-[var(--wk-text-tertiary)]" />
          <h1 className="font-display text-xl font-semibold">Jobs</h1>
        </div>
        <Button variant="secondary" onClick={() => setImportDialogOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          Add Job
        </Button>
      </div>

      {/* Content: split list + detail */}
      <div className="flex flex-1 overflow-hidden">
        <div className="w-full max-w-md border-r border-[var(--wk-border-subtle)] shrink-0">
          <JobLeadList
            leads={leads}
            total={total}
            isLoading={isLoading}
            selectedId={selectedLead?.id ?? null}
            onSelect={handleSelect}
            onQueue={handleQueue}
            onEdit={handleEdit}
            onDelete={handleDelete}
            statusFilter={statusFilter}
            platformFilter={platformFilter}
            searchQuery={searchQuery}
            onStatusChange={handleStatusChange}
            onPlatformChange={handlePlatformChange}
            onSearchChange={handleSearchChange}
            onLoadMore={handleLoadMore}
            hasMore={hasMore}
          />
        </div>

        <div className="flex-1 overflow-y-auto">
          {selectedLead ? (
            <JobLeadDetail
              lead={selectedLead}
              onQueue={handleQueue}
              onDelete={handleDelete}
              onViewTask={handleViewTask}
              isQueueing={queueMutation.isPending}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <Inbox className="h-10 w-10 text-[var(--wk-text-tertiary)]" />
              <p className="mt-3 text-sm text-[var(--wk-text-secondary)]">
                Select a job to view details
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Import dialog */}
      <ImportJobDialog open={importDialogOpen} onOpenChange={setImportDialogOpen} />

      {/* Delete confirmation dialog */}
      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Job</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{deleteTarget?.title}" at {deleteTarget?.company}?
              This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
