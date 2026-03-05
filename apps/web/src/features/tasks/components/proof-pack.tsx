import { Card, CardContent, CardHeader, CardTitle } from "@valet/ui/components/card";
import { Badge } from "@valet/ui/components/badge";
import {
  Camera,
  FileText,
  Clock,
  CheckCircle2,
  XCircle,
  SkipForward,
  ImageOff,
} from "lucide-react";
import { LoadingSpinner } from "@/components/common/loading-spinner";
import { useProofPack } from "../hooks/use-proof-pack";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface ProofPackProps {
  taskId: string;
  compact?: boolean;
}

export function ProofPack({ taskId, compact = false }: ProofPackProps) {
  const { data, isLoading } = useProofPack(taskId);
  const proof = data?.status === 200 ? data.body : null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <LoadingSpinner />
      </div>
    );
  }

  if (!proof) {
    return (
      <div className="px-4 py-8 text-center">
        <ImageOff className="mx-auto h-8 w-8 text-[var(--wk-text-tertiary)]" />
        <p className="mt-2 text-sm text-[var(--wk-text-secondary)]">No proof data available</p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", compact ? "p-3" : "p-0")}>
      {/* Screenshots Gallery */}
      {proof.screenshots.length > 0 && (
        <ScreenshotGallery screenshots={proof.screenshots} compact={compact} />
      )}

      {/* Answers Used */}
      {proof.answers.length > 0 && <AnswersSection answers={proof.answers} compact={compact} />}

      {/* Timeline */}
      {proof.timeline.length > 0 && <TimelineSection timeline={proof.timeline} compact={compact} />}

      {/* Confirmation & Status */}
      <ConfirmationSection
        externalStatus={proof.externalStatus}
        confirmationData={proof.confirmationData}
        resumeVariantId={proof.resumeVariantId}
        createdAt={proof.createdAt}
        compact={compact}
      />
    </div>
  );
}

function ScreenshotGallery({
  screenshots,
  compact,
}: {
  screenshots: Array<{ url: string; label?: string | null; capturedAt?: string | Date | null }>;
  compact: boolean;
}) {
  const [selected, setSelected] = useState(0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Camera className="h-4 w-4 text-[var(--wk-text-tertiary)]" />
          <CardTitle className={compact ? "text-xs" : "text-sm"}>
            Screenshots ({screenshots.length})
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {/* Main image */}
        <div className="overflow-hidden rounded-[var(--wk-radius-md)] border border-[var(--wk-border-subtle)] bg-[var(--wk-surface-sunken)]">
          <img
            src={screenshots[selected]?.url}
            alt={screenshots[selected]?.label ?? `Screenshot ${selected + 1}`}
            className="w-full object-contain"
            style={{ maxHeight: compact ? 200 : 300 }}
          />
        </div>

        {/* Label */}
        {screenshots[selected]?.label && (
          <p className="text-xs text-[var(--wk-text-secondary)]">{screenshots[selected].label}</p>
        )}

        {/* Thumbnail strip */}
        {screenshots.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto py-1">
            {screenshots.map((s, i) => (
              <button
                key={i}
                onClick={() => setSelected(i)}
                className={cn(
                  "h-10 w-14 shrink-0 overflow-hidden rounded border transition-colors cursor-pointer",
                  i === selected
                    ? "border-[var(--wk-accent-amber)]"
                    : "border-[var(--wk-border-subtle)] opacity-60 hover:opacity-100",
                )}
              >
                <img
                  src={s.url}
                  alt={s.label ?? `Thumb ${i + 1}`}
                  className="h-full w-full object-cover"
                />
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AnswersSection({
  answers,
  compact,
}: {
  answers: Array<{ field: string; value: string; source?: string | null }>;
  compact: boolean;
}) {
  const [expanded, setExpanded] = useState(!compact);
  const displayAnswers = expanded ? answers : answers.slice(0, 5);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-[var(--wk-text-tertiary)]" />
          <CardTitle className={compact ? "text-xs" : "text-sm"}>
            Answers ({answers.length} fields)
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {displayAnswers.map((a, i) => (
          <div
            key={i}
            className="flex items-start justify-between gap-2 border-b border-[var(--wk-border-subtle)] pb-2 last:border-0 last:pb-0"
          >
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--wk-text-tertiary)]">
                {a.field}
              </p>
              <p className="mt-0.5 text-xs text-[var(--wk-text-primary)] break-words">{a.value}</p>
            </div>
            {a.source && (
              <Badge variant="secondary" className="shrink-0 text-[9px]">
                {a.source}
              </Badge>
            )}
          </div>
        ))}
        {answers.length > 5 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-[var(--wk-copilot)] hover:underline cursor-pointer"
          >
            {expanded ? "Show less" : `Show all ${answers.length} fields`}
          </button>
        )}
      </CardContent>
    </Card>
  );
}

function TimelineSection({
  timeline,
  compact,
}: {
  timeline: Array<{
    step: string;
    status: string;
    timestamp: string | Date;
    detail?: string | null;
  }>;
  compact: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-[var(--wk-text-tertiary)]" />
          <CardTitle className={compact ? "text-xs" : "text-sm"}>Submission Timeline</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-0">
          {timeline.map((t, i) => (
            <div key={i} className="flex gap-3 pb-3 last:pb-0">
              <div className="flex flex-col items-center">
                {t.status === "completed" ? (
                  <CheckCircle2 className="h-4 w-4 text-[var(--wk-status-success)]" />
                ) : t.status === "failed" ? (
                  <XCircle className="h-4 w-4 text-[var(--wk-status-error)]" />
                ) : (
                  <SkipForward className="h-4 w-4 text-[var(--wk-text-tertiary)]" />
                )}
                {i < timeline.length - 1 && (
                  <div className="mt-1 w-px flex-1 bg-[var(--wk-border-subtle)]" />
                )}
              </div>
              <div className="min-w-0 flex-1 pb-1">
                <p className="text-xs font-medium text-[var(--wk-text-primary)]">{t.step}</p>
                {t.detail && (
                  <p className="mt-0.5 text-[10px] text-[var(--wk-text-tertiary)]">{t.detail}</p>
                )}
                <p className="mt-0.5 text-[10px] text-[var(--wk-text-tertiary)]">
                  {new Date(t.timestamp).toLocaleTimeString()}
                </p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ConfirmationSection({
  externalStatus,
  confirmationData,
  resumeVariantId,
  createdAt,
  compact,
}: {
  externalStatus?: string | null;
  confirmationData?: Record<string, unknown> | null;
  resumeVariantId?: string | null;
  createdAt?: string | Date | null;
  compact: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className={compact ? "text-xs" : "text-sm"}>Confirmation</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {externalStatus && (
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--wk-text-tertiary)]">
              External Status
            </p>
            <Badge variant="info" className="mt-1 capitalize">
              {externalStatus}
            </Badge>
          </div>
        )}

        {resumeVariantId && (
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--wk-text-tertiary)]">
              Resume Variant
            </p>
            <p className="mt-0.5 text-xs font-mono text-[var(--wk-text-secondary)]">
              {resumeVariantId.slice(0, 8)}...
            </p>
          </div>
        )}

        {createdAt && (
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--wk-text-tertiary)]">
              Submitted At
            </p>
            <p className="mt-0.5 text-xs text-[var(--wk-text-secondary)]">
              {new Date(createdAt).toLocaleString()}
            </p>
          </div>
        )}

        {confirmationData && Object.keys(confirmationData).length > 0 && (
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--wk-text-tertiary)]">
              Confirmation Details
            </p>
            <div className="mt-1 rounded-[var(--wk-radius-md)] bg-[var(--wk-surface-sunken)] p-2">
              {Object.entries(confirmationData).map(([key, val]) => (
                <div key={key} className="flex justify-between text-[10px]">
                  <span className="text-[var(--wk-text-tertiary)]">{key}</span>
                  <span className="text-[var(--wk-text-secondary)]">{String(val)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
