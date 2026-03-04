import { useState } from "react";
import { Button } from "@valet/ui/components/button";
import { Loader2, ArrowLeft } from "lucide-react";
import { JobAnalysis } from "./job-analysis";
import { MatchScore } from "./match-score";
import { KeywordGaps } from "./keyword-gaps";
import { ResumeDiff } from "./resume-diff";
import { VariantSelector } from "./variant-selector";
import { useCompareResume, useCreateVariant, useVariant } from "./hooks/use-fit-lab";
import type {
  JobAnalysisResponse,
  CompareResumeResponse,
  ResumeVariantResponse,
} from "@valet/shared/schemas";

interface FitLabPanelProps {
  resumeId: string;
  jobUrl?: string;
  compact?: boolean;
}

type Step = "analyze" | "compare" | "variant";

export function FitLabPanel({ resumeId, jobUrl, compact = false }: FitLabPanelProps) {
  const [step, setStep] = useState<Step>("analyze");
  const [jobDescription, setJobDescription] = useState("");
  const [analysis, setAnalysis] = useState<JobAnalysisResponse | null>(null);
  const [comparison, setComparison] = useState<CompareResumeResponse | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);

  const compareResume = useCompareResume();
  const createVariant = useCreateVariant();
  const { data: variantData } = useVariant(selectedVariantId ?? "", !!selectedVariantId);
  const variant = variantData?.status === 200 ? variantData.body : null;

  function handleJobAnalyzed(data: JobAnalysisResponse, jd: string) {
    setAnalysis(data);
    setJobDescription(jd);

    // Auto-compare resume after job analysis
    compareResume.mutate(
      {
        body: {
          resumeId,
          jobDescription: jd,
        },
      },
      {
        onSuccess: (res) => {
          if (res.status === 200) {
            setComparison(res.body);
            setStep("compare");
          }
        },
      },
    );
  }

  function handleCreateVariant(rephraseMode: "off" | "honest" | "ats_max") {
    if (!analysis || !jobDescription) return;

    createVariant.mutate(
      {
        body: {
          resumeId,
          jobUrl: jobUrl ?? analysis.rawText.slice(0, 100),
          jobDescription,
          rephraseMode,
        },
      },
      {
        onSuccess: (res) => {
          if (res.status === 201) {
            setSelectedVariantId(res.body.id);
            setStep("variant");
          }
        },
      },
    );
  }

  function handleVariantSelect(v: ResumeVariantResponse | null) {
    setSelectedVariantId(v?.id ?? null);
  }

  function handleReset() {
    setStep("analyze");
    setAnalysis(null);
    setComparison(null);
    setSelectedVariantId(null);
    setJobDescription("");
  }

  return (
    <div className="space-y-4 p-4">
      {/* Back / reset button for steps past analyze */}
      {step !== "analyze" && (
        <button
          onClick={handleReset}
          className="flex items-center gap-1 text-xs text-[var(--wk-copilot)] hover:underline cursor-pointer"
        >
          <ArrowLeft className="h-3 w-3" />
          Start over
        </button>
      )}

      {/* Step 1: Analyze job */}
      {step === "analyze" && (
        <>
          <JobAnalysis onAnalyzed={handleJobAnalyzed} compact={compact} />
          {compareResume.isPending && (
            <div className="flex items-center justify-center gap-2 py-4">
              <Loader2 className="h-4 w-4 animate-spin text-[var(--wk-copilot)]" />
              <span className="text-xs text-[var(--wk-text-secondary)]">
                Comparing with your resume...
              </span>
            </div>
          )}
        </>
      )}

      {/* Step 2: Comparison results */}
      {step === "compare" && comparison && (
        <>
          <MatchScore
            score={comparison.matchScore}
            strengthSummary={comparison.strengthSummary}
            improvementSummary={comparison.improvementSummary}
            matchedCount={comparison.matchedRequirements.length}
            missingCount={comparison.missingRequirements.length}
            compact={compact}
          />

          <KeywordGaps gaps={comparison.keywordGaps} compact={compact} />

          {/* Variant creation actions */}
          <div className="space-y-2">
            <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--wk-text-tertiary)]">
              Tailor Resume
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                size="sm"
                className="text-xs"
                onClick={() => handleCreateVariant("honest")}
                disabled={createVariant.isPending}
              >
                {createVariant.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                Honest
              </Button>
              <Button
                variant="primary"
                size="sm"
                className="text-xs"
                onClick={() => handleCreateVariant("ats_max")}
                disabled={createVariant.isPending}
              >
                {createVariant.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                ATS Max
              </Button>
            </div>
            <p className="text-[10px] text-[var(--wk-text-tertiary)]">
              Honest keeps your experience accurate. ATS Max optimizes for keyword matching.
            </p>
          </div>
        </>
      )}

      {/* Step 3: Variant results */}
      {step === "variant" && (
        <>
          {variant && (
            <MatchScore
              score={comparison?.matchScore ?? 0}
              beforeScore={variant.matchScoreBefore}
              afterScore={variant.matchScoreAfter}
              strengthSummary={comparison?.strengthSummary ?? ""}
              improvementSummary={comparison?.improvementSummary ?? ""}
              matchedCount={comparison?.matchedRequirements.length ?? 0}
              missingCount={comparison?.missingRequirements.length ?? 0}
              compact={compact}
            />
          )}

          {variant && (
            <ResumeDiff
              diffData={
                variant.diffData as {
                  changedSections?: string[];
                  changes?: Array<{
                    section: string;
                    field: string;
                    before: string;
                    after: string;
                    reason: string;
                  }>;
                }
              }
              compact={compact}
            />
          )}

          <VariantSelector
            resumeId={resumeId}
            selectedVariantId={selectedVariantId}
            onSelect={handleVariantSelect}
            compact={compact}
          />
        </>
      )}
    </div>
  );
}
