import * as React from "react";
import { useState, useCallback } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@valet/ui/components/card";
import { Badge } from "@valet/ui/components/badge";
import { Button } from "@valet/ui/components/button";
import { Input } from "@valet/ui/components/input";
import { Pencil, Check, ShieldCheck, Brain, BookOpen, Inbox } from "lucide-react";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import { LoadingSpinner } from "@/components/common/loading-spinner";

interface FilledField {
  fieldName: string;
  value: string;
  confidence: number;
  source: "resume" | "llm_generated" | "qa_bank";
  requiresReview: boolean;
}

interface TaskData {
  jobTitle?: string | null;
  companyName?: string | null;
  jobLocation?: string | null;
  jobUrl: string;
  platform: string;
  fieldsFilled: number;
  confidenceScore?: number | null;
}

interface FieldReviewProps {
  taskId: string;
  task?: TaskData;
  onApproved?: () => void;
}

const sourceConfig: Record<
  FilledField["source"],
  { label: string; icon: React.ElementType; variant: "default" | "info" | "copilot" }
> = {
  resume: { label: "Resume", icon: BookOpen, variant: "default" },
  llm_generated: { label: "AI Generated", icon: Brain, variant: "copilot" },
  qa_bank: { label: "Q&A Bank", icon: ShieldCheck, variant: "info" },
};

function getConfidenceColor(score: number): string {
  if (score >= 0.9) return "text-[var(--wk-status-success)]";
  if (score >= 0.7) return "text-[var(--wk-status-warning)]";
  return "text-[var(--wk-status-error)]";
}

function getConfidenceBg(score: number): string {
  if (score >= 0.9) return "bg-emerald-50 dark:bg-emerald-950/30";
  if (score >= 0.7) return "bg-amber-50 dark:bg-amber-950/30";
  return "bg-red-50 dark:bg-red-950/30";
}

/** Build fields from real task metadata. */
function buildFieldsFromTask(task: TaskData): FilledField[] {
  const fields: FilledField[] = [];

  if (task.jobTitle) {
    fields.push({
      fieldName: "Job Title",
      value: task.jobTitle,
      confidence: 0.95,
      source: "resume",
      requiresReview: false,
    });
  }

  if (task.companyName) {
    fields.push({
      fieldName: "Company",
      value: task.companyName,
      confidence: 0.95,
      source: "resume",
      requiresReview: false,
    });
  }

  if (task.jobLocation) {
    fields.push({
      fieldName: "Location",
      value: task.jobLocation,
      confidence: 0.85,
      source: "resume",
      requiresReview: false,
    });
  }

  fields.push({
    fieldName: "Application URL",
    value: task.jobUrl,
    confidence: 1.0,
    source: "resume",
    requiresReview: false,
  });

  fields.push({
    fieldName: "Platform",
    value: task.platform,
    confidence: 1.0,
    source: "resume",
    requiresReview: false,
  });

  // If the task has filled fields but we don't have granular data yet,
  // show a summary indicator
  if (task.fieldsFilled > fields.length) {
    const remaining = task.fieldsFilled - fields.length;
    fields.push({
      fieldName: `+ ${remaining} additional field${remaining === 1 ? "" : "s"}`,
      value: "Auto-filled by VALET",
      confidence: task.confidenceScore ?? 0.8,
      source: "llm_generated",
      requiresReview: (task.confidenceScore ?? 0.8) < 0.85,
    });
  }

  return fields;
}

export function FieldReview({ taskId, task, onApproved }: FieldReviewProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, string>>({});

  const approveTask = api.tasks.approve.useMutation({
    onSuccess: () => {
      toast.success("Application approved and submitted.");
      onApproved?.();
    },
    onError: () => {
      toast.error("Failed to approve application. Please try again.");
    },
  });

  const handleFieldChange = useCallback(
    (fieldName: string, value: string) => {
      setOverrides((prev) => ({ ...prev, [fieldName]: value }));
    },
    []
  );

  const handleApprove = useCallback(() => {
    const fieldOverrides = Object.keys(overrides).length > 0 ? overrides : undefined;
    approveTask.mutate({
      params: { id: taskId },
      body: { fieldOverrides },
    });
  }, [taskId, overrides, approveTask]);

  const fields = task ? buildFieldsFromTask(task) : [];
  const reviewCount = fields.filter((f) => f.requiresReview).length;

  // No task data available yet — show loading state
  if (!task) {
    return (
      <Card className="border-[var(--wk-status-warning)] border-2">
        <CardContent className="flex justify-center py-8">
          <LoadingSpinner />
        </CardContent>
      </Card>
    );
  }

  // Task has no meaningful fields to review
  if (fields.length === 0) {
    return (
      <Card className="border-[var(--wk-status-warning)] border-2">
        <CardContent className="flex flex-col items-center justify-center py-8 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-[var(--wk-radius-2xl)] bg-[var(--wk-surface-sunken)]">
            <Inbox className="h-5 w-5 text-[var(--wk-text-tertiary)]" />
          </div>
          <p className="mt-3 text-sm text-[var(--wk-text-secondary)]">
            No field data available for review yet.
          </p>
          <Button
            variant="primary"
            className="mt-4"
            disabled={approveTask.isPending}
            onClick={handleApprove}
          >
            {approveTask.isPending ? "Approving..." : "Approve & Submit"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-[var(--wk-status-warning)] border-2">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CardTitle className="text-lg">Review Fields</CardTitle>
            {reviewCount > 0 && (
              <Badge variant="warning">
                {reviewCount} need{reviewCount > 1 ? "" : "s"} review
              </Badge>
            )}
          </div>
          <Button
            variant={isEditing ? "primary" : "ghost"}
            size="sm"
            onClick={() => setIsEditing(!isEditing)}
            aria-label={isEditing ? "Done editing fields" : "Edit fields"}
          >
            {isEditing ? (
              <>
                <Check className="h-3.5 w-3.5" />
                Done Editing
              </>
            ) : (
              <>
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </>
            )}
          </Button>
        </div>
        <p className="text-sm text-[var(--wk-text-secondary)]">
          Review the auto-filled fields before submitting your application.
        </p>
      </CardHeader>
      <CardContent className="space-y-1">
        {/* Header row - hidden on mobile */}
        <div className="hidden md:grid grid-cols-[1fr_1.5fr_80px_100px] gap-3 px-3 py-2 text-xs font-medium uppercase tracking-wider text-[var(--wk-text-secondary)]">
          <span>Field</span>
          <span>Value</span>
          <span>Confidence</span>
          <span>Source</span>
        </div>

        {/* Field rows */}
        <div className="space-y-1">
          {fields.map((field) => {
            const currentValue = overrides[field.fieldName] ?? field.value;
            const source = sourceConfig[field.source];
            const SourceIcon = source.icon;

            return (
              <div
                key={field.fieldName}
                className={`rounded-[var(--wk-radius-md)] px-3 py-2.5 transition-colors ${
                  field.requiresReview
                    ? "bg-amber-50/50 dark:bg-amber-950/10"
                    : "hover:bg-[var(--wk-surface-sunken)]"
                }`}
              >
                {/* Desktop: grid layout */}
                <div className="hidden md:grid grid-cols-[1fr_1.5fr_80px_100px] gap-3 items-center">
                  <span className="text-sm font-medium truncate">
                    {field.fieldName}
                  </span>

                  {isEditing ? (
                    <Input
                      value={currentValue}
                      onChange={(e) =>
                        handleFieldChange(field.fieldName, e.target.value)
                      }
                      className="h-8 text-sm"
                      aria-label={`Edit ${field.fieldName}`}
                    />
                  ) : (
                    <span className="text-sm text-[var(--wk-text-secondary)] truncate">
                      {currentValue}
                    </span>
                  )}

                  <span
                    className={`inline-flex items-center justify-center rounded-[var(--wk-radius-sm)] px-2 py-0.5 text-xs font-medium ${getConfidenceColor(field.confidence)} ${getConfidenceBg(field.confidence)}`}
                  >
                    {Math.round(field.confidence * 100)}%
                  </span>

                  <Badge
                    variant={source.variant}
                    className="text-[10px] gap-1 w-fit"
                  >
                    <SourceIcon className="h-3 w-3" />
                    {source.label}
                  </Badge>
                </div>

                {/* Mobile: stacked layout */}
                <div className="md:hidden space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium truncate">
                      {field.fieldName}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`inline-flex items-center justify-center rounded-[var(--wk-radius-sm)] px-2 py-0.5 text-xs font-medium ${getConfidenceColor(field.confidence)} ${getConfidenceBg(field.confidence)}`}
                      >
                        {Math.round(field.confidence * 100)}%
                      </span>
                      <Badge
                        variant={source.variant}
                        className="text-[10px] gap-1 w-fit"
                      >
                        <SourceIcon className="h-3 w-3" />
                        {source.label}
                      </Badge>
                    </div>
                  </div>

                  {isEditing ? (
                    <Input
                      value={currentValue}
                      onChange={(e) =>
                        handleFieldChange(field.fieldName, e.target.value)
                      }
                      className="h-8 text-sm"
                      aria-label={`Edit ${field.fieldName}`}
                    />
                  ) : (
                    <p className="text-sm text-[var(--wk-text-secondary)]">
                      {currentValue}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Action button */}
        <div className="pt-4">
          <Button
            variant="primary"
            className="w-full"
            disabled={approveTask.isPending}
            onClick={handleApprove}
          >
            {approveTask.isPending ? "Approving..." : "Approve & Submit"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
