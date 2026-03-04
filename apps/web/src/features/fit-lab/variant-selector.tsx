import { Card, CardContent, CardHeader, CardTitle } from "@valet/ui/components/card";
import { Badge } from "@valet/ui/components/badge";
import { FileText, CheckCircle2, Loader2 } from "lucide-react";
import { useVariants } from "./hooks/use-fit-lab";
import type { ResumeVariantResponse } from "@valet/shared/schemas";
import { cn } from "@/lib/utils";

interface VariantSelectorProps {
  resumeId: string;
  selectedVariantId: string | null;
  onSelect: (variant: ResumeVariantResponse | null) => void;
  compact?: boolean;
}

export function VariantSelector({
  resumeId,
  selectedVariantId,
  onSelect,
  compact = false,
}: VariantSelectorProps) {
  const { data, isLoading } = useVariants(resumeId);
  const variants = data?.status === 200 ? data.body.data : [];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className={compact ? "text-xs" : "text-sm"}>Resume Version</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {/* Base resume option */}
        <button
          onClick={() => onSelect(null)}
          className={cn(
            "flex w-full items-center gap-2 rounded-[var(--wk-radius-sm)] border p-2.5 text-left transition-colors cursor-pointer",
            selectedVariantId === null
              ? "border-[var(--wk-copilot)] bg-[var(--wk-copilot)]/5"
              : "border-[var(--wk-border-subtle)] hover:border-[var(--wk-border-default)]",
          )}
        >
          <FileText className="h-4 w-4 shrink-0 text-[var(--wk-text-tertiary)]" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-[var(--wk-text-primary)]">Original Resume</p>
            <p className="text-[10px] text-[var(--wk-text-tertiary)]">Unmodified version</p>
          </div>
          {selectedVariantId === null && (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--wk-copilot)]" />
          )}
        </button>

        {isLoading && (
          <div className="flex items-center justify-center py-3">
            <Loader2 className="h-4 w-4 animate-spin text-[var(--wk-text-tertiary)]" />
          </div>
        )}

        {variants.map((variant) => (
          <button
            key={variant.id}
            onClick={() => onSelect(variant)}
            className={cn(
              "flex w-full items-center gap-2 rounded-[var(--wk-radius-sm)] border p-2.5 text-left transition-colors cursor-pointer",
              selectedVariantId === variant.id
                ? "border-[var(--wk-copilot)] bg-[var(--wk-copilot)]/5"
                : "border-[var(--wk-border-subtle)] hover:border-[var(--wk-border-default)]",
            )}
          >
            <FileText className="h-4 w-4 shrink-0 text-[var(--wk-accent-teal)]" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-xs font-medium text-[var(--wk-text-primary)] truncate">
                  Tailored Variant
                </p>
                <Badge variant="info" className="text-[8px] shrink-0">
                  {variant.rephraseMode.replace("_", " ")}
                </Badge>
              </div>
              <p className="text-[10px] text-[var(--wk-text-tertiary)] truncate">
                {variant.jobUrl}
              </p>
              {variant.matchScoreBefore != null && variant.matchScoreAfter != null && (
                <div className="mt-0.5 flex items-center gap-1 text-[10px]">
                  <span className="text-[var(--wk-text-tertiary)]">
                    {variant.matchScoreBefore}%
                  </span>
                  <span className="text-[var(--wk-text-tertiary)]">{"\u2192"}</span>
                  <span
                    className={
                      variant.matchScoreAfter > variant.matchScoreBefore
                        ? "text-[var(--wk-status-success)] font-medium"
                        : "text-[var(--wk-text-secondary)]"
                    }
                  >
                    {variant.matchScoreAfter}%
                  </span>
                </div>
              )}
            </div>
            {selectedVariantId === variant.id && (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--wk-copilot)]" />
            )}
          </button>
        ))}

        {!isLoading && variants.length === 0 && (
          <p className="py-2 text-center text-[10px] text-[var(--wk-text-tertiary)]">
            No tailored variants yet. Analyze a job to create one.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
