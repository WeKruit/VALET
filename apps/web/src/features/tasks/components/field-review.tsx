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
import { Pencil, Check, ShieldCheck, Brain, BookOpen } from "lucide-react";
import { api } from "@/lib/api-client";
import { toast } from "sonner";

interface FilledField {
  fieldName: string;
  value: string;
  confidence: number;
  source: "resume" | "llm_generated" | "qa_bank";
  requiresReview: boolean;
}

interface FieldReviewProps {
  taskId: string;
  onApproved?: () => void;
}

// Mock data - real data comes through WebSocket/API
const MOCK_FIELDS: FilledField[] = [
  {
    fieldName: "First Name",
    value: "John",
    confidence: 0.98,
    source: "resume",
    requiresReview: false,
  },
  {
    fieldName: "Last Name",
    value: "Doe",
    confidence: 0.98,
    source: "resume",
    requiresReview: false,
  },
  {
    fieldName: "Email",
    value: "john.doe@example.com",
    confidence: 0.95,
    source: "resume",
    requiresReview: false,
  },
  {
    fieldName: "Phone",
    value: "(555) 123-4567",
    confidence: 0.92,
    source: "resume",
    requiresReview: false,
  },
  {
    fieldName: "Current Company",
    value: "Acme Corp",
    confidence: 0.85,
    source: "resume",
    requiresReview: false,
  },
  {
    fieldName: "Years of Experience",
    value: "5",
    confidence: 0.72,
    source: "llm_generated",
    requiresReview: true,
  },
  {
    fieldName: "Why are you interested?",
    value: "I'm passionate about building impactful products and this role aligns with my experience in full-stack development.",
    confidence: 0.65,
    source: "llm_generated",
    requiresReview: true,
  },
  {
    fieldName: "Salary Expectation",
    value: "120000",
    confidence: 0.55,
    source: "qa_bank",
    requiresReview: true,
  },
];

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

export function FieldReview({ taskId, onApproved }: FieldReviewProps) {
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

  const fields = MOCK_FIELDS;
  const reviewCount = fields.filter((f) => f.requiresReview).length;

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
        {/* Header row */}
        <div className="grid grid-cols-[1fr_1.5fr_80px_100px] gap-3 px-3 py-2 text-xs font-medium uppercase tracking-wider text-[var(--wk-text-secondary)]">
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
                className={`grid grid-cols-[1fr_1.5fr_80px_100px] gap-3 items-center rounded-[var(--wk-radius-md)] px-3 py-2.5 transition-colors ${
                  field.requiresReview
                    ? "bg-amber-50/50 dark:bg-amber-950/10"
                    : "hover:bg-[var(--wk-surface-sunken)]"
                }`}
              >
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
