import { Badge } from "@valet/ui/components/badge";
import { Button } from "@valet/ui/components/button";
import {
  Linkedin,
  Globe,
  Building2,
  MapPin,
  ExternalLink,
  MoreHorizontal,
  Trash2,
  Pencil,
  Play,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@valet/ui/components/dropdown-menu";
import type { JobLead } from "@valet/shared/schemas";

const PLATFORM_ICONS: Record<string, typeof Linkedin> = {
  linkedin: Linkedin,
  greenhouse: Building2,
  lever: Building2,
  workday: Building2,
  unknown: Globe,
};

const PLATFORM_LABELS: Record<string, string> = {
  linkedin: "LinkedIn",
  greenhouse: "Greenhouse",
  lever: "Lever",
  workday: "Workday",
  unknown: "Other",
};

const PLATFORM_BADGE_VARIANT: Record<
  string,
  "info" | "success" | "warning" | "copilot" | "default"
> = {
  linkedin: "info",
  greenhouse: "success",
  lever: "copilot",
  workday: "warning",
  unknown: "default",
};

const STATUS_LABELS: Record<string, string> = {
  saved: "Saved",
  reviewing: "Reviewing",
  queued: "Queued",
  applied: "Applied",
  rejected: "Rejected",
  archived: "Archived",
};

const STATUS_BADGE_VARIANT: Record<
  string,
  "default" | "info" | "success" | "warning" | "error" | "secondary"
> = {
  saved: "default",
  reviewing: "info",
  queued: "copilot" as any,
  applied: "success",
  rejected: "error",
  archived: "secondary",
};

interface JobLeadCardProps {
  lead: JobLead;
  onSelect: (lead: JobLead) => void;
  onQueue: (lead: JobLead) => void;
  onEdit: (lead: JobLead) => void;
  onDelete: (lead: JobLead) => void;
  isSelected?: boolean;
}

export function JobLeadCard({
  lead,
  onSelect,
  onQueue,
  onEdit,
  onDelete,
  isSelected,
}: JobLeadCardProps) {
  const PlatformIcon = PLATFORM_ICONS[lead.platform] ?? Globe;
  const canQueue = lead.status === "saved" || lead.status === "reviewing";

  return (
    <button
      type="button"
      onClick={() => onSelect(lead)}
      className={`w-full text-left rounded-[var(--wk-radius-lg)] border p-4 transition-colors cursor-pointer ${
        isSelected
          ? "border-[var(--wk-copilot)] bg-[color-mix(in_srgb,var(--wk-copilot)_4%,transparent)]"
          : "border-[var(--wk-border-subtle)] hover:border-[var(--wk-border-default)]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold truncate">{lead.title}</h3>
          </div>

          <div className="flex items-center gap-2 text-sm text-[var(--wk-text-secondary)]">
            <PlatformIcon className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{lead.company}</span>
            {lead.location && (
              <>
                <span className="text-[var(--wk-text-tertiary)]">|</span>
                <MapPin className="h-3 w-3 shrink-0 text-[var(--wk-text-tertiary)]" />
                <span className="truncate">{lead.location}</span>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            <Badge variant={PLATFORM_BADGE_VARIANT[lead.platform] ?? "default"}>
              {PLATFORM_LABELS[lead.platform] ?? "Other"}
            </Badge>
            <Badge variant={STATUS_BADGE_VARIANT[lead.status] ?? "default"}>
              {STATUS_LABELS[lead.status] ?? lead.status}
            </Badge>
            {lead.matchScore !== null && lead.matchScore !== undefined && (
              <Badge
                variant={
                  lead.matchScore >= 80 ? "success" : lead.matchScore >= 50 ? "warning" : "error"
                }
              >
                {lead.matchScore}% match
              </Badge>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {canQueue && (
            <Button
              variant="secondary"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onQueue(lead);
              }}
              title="Queue for application"
            >
              <Play className="h-3.5 w-3.5 mr-1" />
              Apply
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" onClick={(e) => e.stopPropagation()}>
                <MoreHorizontal className="h-4 w-4 text-[var(--wk-text-tertiary)]" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(lead.jobUrl, "_blank", "noopener");
                }}
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                Open Job URL
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(lead);
                }}
              >
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(lead);
                }}
                className="text-[var(--wk-status-error)]"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </button>
  );
}
