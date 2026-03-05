import { useState } from "react";
import { Input } from "@valet/ui/components/input";
import { Button } from "@valet/ui/components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@valet/ui/components/select";
import { Search, SlidersHorizontal } from "lucide-react";
import { JobLeadCard } from "./job-lead-card";
import { LoadingSpinner } from "@/components/common/loading-spinner";
import type { JobLead } from "@valet/shared/schemas";

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "saved", label: "Saved" },
  { value: "reviewing", label: "Reviewing" },
  { value: "queued", label: "Queued" },
  { value: "applied", label: "Applied" },
  { value: "rejected", label: "Rejected" },
  { value: "archived", label: "Archived" },
] as const;

const PLATFORM_OPTIONS = [
  { value: "all", label: "All Platforms" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "greenhouse", label: "Greenhouse" },
  { value: "lever", label: "Lever" },
  { value: "workday", label: "Workday" },
  { value: "unknown", label: "Other" },
] as const;

interface JobLeadListProps {
  leads: JobLead[];
  total: number;
  isLoading: boolean;
  selectedId: string | null;
  onSelect: (lead: JobLead) => void;
  onQueue: (lead: JobLead) => void;
  onEdit: (lead: JobLead) => void;
  onDelete: (lead: JobLead) => void;
  statusFilter: string;
  platformFilter: string;
  searchQuery: string;
  onStatusChange: (status: string) => void;
  onPlatformChange: (platform: string) => void;
  onSearchChange: (query: string) => void;
  onLoadMore: () => void;
  hasMore: boolean;
}

export function JobLeadList({
  leads,
  total,
  isLoading,
  selectedId,
  onSelect,
  onQueue,
  onEdit,
  onDelete,
  statusFilter,
  platformFilter,
  searchQuery,
  onStatusChange,
  onPlatformChange,
  onSearchChange,
  onLoadMore,
  hasMore,
}: JobLeadListProps) {
  const [showFilters, setShowFilters] = useState(false);

  return (
    <div className="flex h-full flex-col">
      {/* Search + filters */}
      <div className="space-y-3 border-b border-[var(--wk-border-subtle)] p-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--wk-text-tertiary)]" />
            <Input
              placeholder="Search jobs..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button
            variant={showFilters ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            title="Toggle filters"
          >
            <SlidersHorizontal className="h-4 w-4" />
          </Button>
        </div>

        {showFilters && (
          <div className="flex gap-2">
            <Select value={statusFilter} onValueChange={onStatusChange}>
              <SelectTrigger className="flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={platformFilter} onValueChange={onPlatformChange}>
              <SelectTrigger className="flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLATFORM_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <p className="text-xs text-[var(--wk-text-tertiary)]">
          {total} job{total !== 1 ? "s" : ""}
        </p>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {isLoading && leads.length === 0 ? (
          <div className="flex justify-center py-8">
            <LoadingSpinner />
          </div>
        ) : leads.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-sm text-[var(--wk-text-secondary)]">
              No jobs found. Import a URL or add one manually.
            </p>
          </div>
        ) : (
          <>
            {leads.map((lead) => (
              <JobLeadCard
                key={lead.id}
                lead={lead}
                isSelected={selectedId === lead.id}
                onSelect={onSelect}
                onQueue={onQueue}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}
            {hasMore && (
              <div className="flex justify-center pt-2">
                <Button variant="ghost" size="sm" onClick={onLoadMore} disabled={isLoading}>
                  {isLoading ? "Loading..." : "Load more"}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
