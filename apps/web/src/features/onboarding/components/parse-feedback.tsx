import { useState, useEffect } from "react";
import { Card, CardContent } from "@valet/ui/components/card";
import { Skeleton } from "@valet/ui/components/skeleton";
import { Check, FileText, AlertCircle, RotateCw } from "lucide-react";
import { Button } from "@valet/ui/components/button";
import { cn } from "@/lib/utils";
import type { ParseStatus, ParsedResumeData } from "../hooks/use-resume-parse";

interface ParseFeedbackProps {
  filename: string;
  parseStatus: ParseStatus;
  parsedData: ParsedResumeData | null;
  error: string | null;
  onRetry: () => void;
  onParseComplete: () => void;
}

const STATUS_MESSAGES = [
  "Reading document...",
  "Extracting contact details...",
  "Extracting work history...",
  "Extracting skills and education...",
  "Analyzing qualifications...",
];

const ROTATION_INTERVAL_MS = 1_500;

export function ParseFeedback({
  filename,
  parseStatus,
  parsedData,
  error,
  onRetry,
  onParseComplete,
}: ParseFeedbackProps) {
  const [messageIndex, setMessageIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);

  // Rotate status messages while parsing
  useEffect(() => {
    if (parseStatus !== "parsing") return;

    const timer = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % STATUS_MESSAGES.length);
    }, ROTATION_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [parseStatus]);

  // Trigger reveal animation when parsed
  useEffect(() => {
    if (parseStatus === "parsed" && parsedData) {
      const timer = setTimeout(() => setRevealed(true), 100);
      return () => clearTimeout(timer);
    }
  }, [parseStatus, parsedData]);

  // Auto-continue shortly after reveal
  useEffect(() => {
    if (revealed) {
      const timer = setTimeout(onParseComplete, 1_200);
      return () => clearTimeout(timer);
    }
  }, [revealed, onParseComplete]);

  if (parseStatus === "failed") {
    return (
      <Card className="max-w-md mx-auto">
        <CardContent className="p-8 text-center space-y-4">
          <div className="flex justify-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-[var(--wk-status-error)]">
              <AlertCircle className="h-6 w-6" />
            </div>
          </div>
          <div>
            <p className="font-medium">Parsing Failed</p>
            <p className="text-sm text-[var(--wk-text-secondary)] mt-1">
              {error ?? "We couldn't parse your resume. Please try again."}
            </p>
          </div>
          <Button variant="secondary" onClick={onRetry}>
            <RotateCw className="h-4 w-4 mr-2" />
            Try Again
          </Button>
        </CardContent>
      </Card>
    );
  }

  const isParsing = parseStatus === "parsing";
  const isParsed = parseStatus === "parsed" && parsedData;

  return (
    <Card className="max-w-md mx-auto">
      <CardContent className="p-8 space-y-6">
        {/* Upload confirmation */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-[var(--wk-status-success)]">
            <Check className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{filename}</p>
            <p className="text-xs text-[var(--wk-text-secondary)]">Uploaded successfully</p>
          </div>
        </div>

        {/* Status message */}
        {isParsing && (
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-[var(--wk-copilot)] animate-pulse shrink-0" />
            <p className="text-sm text-[var(--wk-text-secondary)] transition-opacity duration-300">
              {STATUS_MESSAGES[messageIndex]}
            </p>
          </div>
        )}

        {/* Skeleton / Revealed fields */}
        <div className="space-y-4">
          {/* Contact section */}
          <div className="space-y-2">
            <FieldRow
              label="Name"
              value={isParsed ? parsedData.fullName : undefined}
              loading={isParsing}
              revealed={revealed}
              delay={0}
            />
            <FieldRow
              label="Email"
              value={isParsed ? parsedData.email : undefined}
              loading={isParsing}
              revealed={revealed}
              delay={50}
            />
            <FieldRow
              label="Phone"
              value={isParsed ? parsedData.phone : undefined}
              loading={isParsing}
              revealed={revealed}
              delay={100}
            />
            <FieldRow
              label="Location"
              value={isParsed ? parsedData.location : undefined}
              loading={isParsing}
              revealed={revealed}
              delay={150}
            />
          </div>

          {/* Experience section */}
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wider text-[var(--wk-text-secondary)]">
              Experience
            </p>
            {isParsing ? (
              <>
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </>
            ) : isParsed ? (
              <div
                className={cn(
                  "transition-all duration-300",
                  revealed ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1",
                )}
                style={{ transitionDelay: "200ms" }}
              >
                {(parsedData.workHistory ?? []).slice(0, 2).map((job, i) => (
                  <p key={i} className="text-sm">
                    {job.title} at {job.company}
                  </p>
                ))}
                {(parsedData.workHistory ?? []).length === 0 && (
                  <p className="text-sm text-[var(--wk-text-tertiary)]">No experience found</p>
                )}
              </div>
            ) : null}
          </div>

          {/* Skills section */}
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wider text-[var(--wk-text-secondary)]">
              Skills
            </p>
            {isParsing ? (
              <div className="flex gap-2">
                <Skeleton className="h-6 w-16 rounded-full" />
                <Skeleton className="h-6 w-20 rounded-full" />
                <Skeleton className="h-6 w-14 rounded-full" />
              </div>
            ) : isParsed ? (
              <div
                className={cn(
                  "flex flex-wrap gap-1.5 transition-all duration-300",
                  revealed ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1",
                )}
                style={{ transitionDelay: "250ms" }}
              >
                {(parsedData.skills ?? []).slice(0, 5).map((skill) => (
                  <span
                    key={skill}
                    className="inline-flex px-2 py-0.5 text-xs rounded-full bg-[var(--wk-surface-sunken)] text-[var(--wk-text-secondary)]"
                  >
                    {skill}
                  </span>
                ))}
                {(parsedData.skills ?? []).length > 5 && (
                  <span className="inline-flex px-2 py-0.5 text-xs rounded-full bg-[var(--wk-surface-sunken)] text-[var(--wk-text-tertiary)]">
                    +{(parsedData.skills ?? []).length - 5} more
                  </span>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function FieldRow({
  label,
  value,
  loading,
  revealed,
  delay,
}: {
  label: string;
  value?: string | null;
  loading: boolean;
  revealed: boolean;
  delay: number;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs font-medium text-[var(--wk-text-secondary)] w-16 shrink-0">
        {label}
      </span>
      {loading ? (
        <Skeleton className="h-4 flex-1" />
      ) : (
        <span
          className={cn(
            "text-sm transition-all duration-300",
            revealed ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1",
            !value && "text-[var(--wk-text-tertiary)] italic",
          )}
          style={{ transitionDelay: `${delay}ms` }}
        >
          {value || "Not found"}
        </span>
      )}
    </div>
  );
}
