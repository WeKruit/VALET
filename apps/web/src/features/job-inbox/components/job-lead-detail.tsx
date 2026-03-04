import { Badge } from "@valet/ui/components/badge";
import { Button } from "@valet/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@valet/ui/components/card";
import {
  Linkedin,
  Globe,
  Building2,
  MapPin,
  ExternalLink,
  Play,
  Clock,
  Trash2,
  ArrowRight,
} from "lucide-react";
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

const STATUS_LABELS: Record<string, string> = {
  saved: "Saved",
  reviewing: "Reviewing",
  queued: "Queued",
  applied: "Applied",
  rejected: "Rejected",
  archived: "Archived",
};

const STATUS_BADGE_VARIANT: Record<string, any> = {
  saved: "default",
  reviewing: "info",
  queued: "copilot",
  applied: "success",
  rejected: "error",
  archived: "secondary",
};

interface JobLeadDetailProps {
  lead: JobLead;
  onQueue: (lead: JobLead) => void;
  onDelete: (lead: JobLead) => void;
  onViewTask: (taskId: string) => void;
  isQueueing?: boolean;
}

export function JobLeadDetail({
  lead,
  onQueue,
  onDelete,
  onViewTask,
  isQueueing,
}: JobLeadDetailProps) {
  const PlatformIcon = PLATFORM_ICONS[lead.platform] ?? Globe;
  const canQueue = lead.status === "saved" || lead.status === "reviewing";
  const createdDate = new Date(lead.createdAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="space-y-4 p-6">
      {/* Header */}
      <div>
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-display text-xl font-semibold">{lead.title}</h2>
          <Badge variant={STATUS_BADGE_VARIANT[lead.status] ?? "default"}>
            {STATUS_LABELS[lead.status] ?? lead.status}
          </Badge>
        </div>
        <div className="mt-2 flex items-center gap-3 text-sm text-[var(--wk-text-secondary)]">
          <div className="flex items-center gap-1.5">
            <PlatformIcon className="h-4 w-4" />
            <span>{lead.company}</span>
          </div>
          {lead.location && (
            <div className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              <span>{lead.location}</span>
            </div>
          )}
          <div className="flex items-center gap-1 text-[var(--wk-text-tertiary)]">
            <Clock className="h-3.5 w-3.5" />
            <span>{createdDate}</span>
          </div>
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Platform</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 pb-3">
            <div className="flex items-center gap-2">
              <PlatformIcon className="h-5 w-5 text-[var(--wk-text-secondary)]" />
              <span className="text-sm font-medium">
                {PLATFORM_LABELS[lead.platform] ?? "Other"}
              </span>
            </div>
          </CardContent>
        </Card>

        {lead.matchScore !== null && lead.matchScore !== undefined && (
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Match Score</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 pb-3">
              <div className="flex items-center gap-2">
                <div
                  className={`text-2xl font-bold ${
                    lead.matchScore >= 80
                      ? "text-[var(--wk-status-success)]"
                      : lead.matchScore >= 50
                        ? "text-[var(--wk-status-warning)]"
                        : "text-[var(--wk-status-error)]"
                  }`}
                >
                  {lead.matchScore}%
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Job URL */}
      <Card>
        <CardContent className="py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-[var(--wk-text-tertiary)] uppercase tracking-wide">
                Job URL
              </p>
              <p className="mt-0.5 truncate text-sm text-[var(--wk-text-secondary)]">
                {lead.jobUrl}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => window.open(lead.jobUrl, "_blank", "noopener")}
            >
              <ExternalLink className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Linked Task */}
      {lead.taskId && (
        <Card>
          <CardContent className="py-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-[var(--wk-text-tertiary)] uppercase tracking-wide">
                  Linked Task
                </p>
                <p className="mt-0.5 text-sm font-mono text-[var(--wk-text-secondary)]">
                  {lead.taskId.slice(0, 8)}...
                </p>
              </div>
              <Button variant="secondary" size="sm" onClick={() => onViewTask(lead.taskId!)}>
                View Task
                <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        {canQueue && (
          <Button
            variant="primary"
            onClick={() => onQueue(lead)}
            disabled={isQueueing}
            className="flex-1"
          >
            <Play className="mr-1.5 h-4 w-4" />
            {isQueueing ? "Queueing..." : "Queue for Application"}
          </Button>
        )}
        <Button
          variant="ghost"
          onClick={() => onDelete(lead)}
          className="text-[var(--wk-status-error)]"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
