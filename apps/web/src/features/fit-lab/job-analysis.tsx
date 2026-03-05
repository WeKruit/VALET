import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@valet/ui/components/card";
import { Badge } from "@valet/ui/components/badge";
import { Button } from "@valet/ui/components/button";
import { Input } from "@valet/ui/components/input";
import { Textarea } from "@valet/ui/components/textarea";
import { Link2, FileText, Loader2, Briefcase, MapPin, Building2 } from "lucide-react";
import { useAnalyzeJob } from "./hooks/use-fit-lab";
import type { JobAnalysisResponse } from "@valet/shared/schemas";
import { cn } from "@/lib/utils";

interface JobAnalysisProps {
  onAnalyzed: (analysis: JobAnalysisResponse, jobDescription: string) => void;
  compact?: boolean;
}

const IMPORTANCE_COLORS: Record<string, { variant: "error" | "warning" | "info" }> = {
  required: { variant: "error" },
  preferred: { variant: "warning" },
  nice_to_have: { variant: "info" },
};

const CATEGORY_LABELS: Record<string, string> = {
  hard_skill: "Technical",
  soft_skill: "Soft Skill",
  experience: "Experience",
  education: "Education",
  certification: "Certification",
  other: "Other",
};

export function JobAnalysis({ onAnalyzed, compact = false }: JobAnalysisProps) {
  const [mode, setMode] = useState<"url" | "text">("text");
  const [jobUrl, setJobUrl] = useState("");
  const [jobText, setJobText] = useState("");
  const [analysis, setAnalysis] = useState<JobAnalysisResponse | null>(null);

  const analyzeJob = useAnalyzeJob();

  function handleAnalyze() {
    const body =
      mode === "url"
        ? { jobUrl, jobDescription: undefined }
        : { jobDescription: jobText, jobUrl: undefined };

    analyzeJob.mutate(
      { body: body as Parameters<typeof analyzeJob.mutate>[0]["body"] },
      {
        onSuccess: (data) => {
          if (data.status === 200) {
            setAnalysis(data.body);
            onAnalyzed(data.body, mode === "text" ? jobText : data.body.rawText);
          }
        },
      },
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className={compact ? "text-xs" : "text-sm"}>Job Analysis</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!analysis ? (
          <>
            {/* Mode toggle */}
            <div className="flex gap-1 rounded-[var(--wk-radius-md)] bg-[var(--wk-surface-sunken)] p-0.5">
              <button
                onClick={() => setMode("text")}
                className={cn(
                  "flex-1 rounded-[var(--wk-radius-sm)] px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer",
                  mode === "text"
                    ? "bg-[var(--wk-surface-page)] text-[var(--wk-text-primary)] shadow-sm"
                    : "text-[var(--wk-text-tertiary)] hover:text-[var(--wk-text-secondary)]",
                )}
              >
                <FileText className="mr-1 inline h-3 w-3" />
                Paste JD
              </button>
              <button
                onClick={() => setMode("url")}
                className={cn(
                  "flex-1 rounded-[var(--wk-radius-sm)] px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer",
                  mode === "url"
                    ? "bg-[var(--wk-surface-page)] text-[var(--wk-text-primary)] shadow-sm"
                    : "text-[var(--wk-text-tertiary)] hover:text-[var(--wk-text-secondary)]",
                )}
              >
                <Link2 className="mr-1 inline h-3 w-3" />
                URL
              </button>
            </div>

            {mode === "url" ? (
              <Input
                type="url"
                placeholder="https://www.linkedin.com/jobs/view/..."
                value={jobUrl}
                onChange={(e) => setJobUrl(e.target.value)}
              />
            ) : (
              <Textarea
                placeholder="Paste the full job description here..."
                value={jobText}
                onChange={(e) => setJobText(e.target.value)}
                rows={compact ? 4 : 6}
                className="resize-none text-xs"
              />
            )}

            <Button
              variant="primary"
              size="sm"
              className="w-full"
              disabled={analyzeJob.isPending || (mode === "url" ? !jobUrl.trim() : !jobText.trim())}
              onClick={handleAnalyze}
            >
              {analyzeJob.isPending ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Analyzing...
                </>
              ) : (
                "Analyze Job"
              )}
            </Button>
          </>
        ) : (
          <AnalysisResult analysis={analysis} compact={compact} onReset={() => setAnalysis(null)} />
        )}
      </CardContent>
    </Card>
  );
}

function AnalysisResult({
  analysis,
  compact: _compact,
  onReset,
}: {
  analysis: JobAnalysisResponse;
  compact: boolean;
  onReset: () => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const requirements = showAll ? analysis.requirements : analysis.requirements.slice(0, 8);

  return (
    <div className="space-y-3">
      {/* Job header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Briefcase className="h-3.5 w-3.5 text-[var(--wk-text-tertiary)]" />
          <span className="text-sm font-medium text-[var(--wk-text-primary)]">
            {analysis.title}
          </span>
        </div>
        {analysis.company && (
          <div className="flex items-center gap-2">
            <Building2 className="h-3.5 w-3.5 text-[var(--wk-text-tertiary)]" />
            <span className="text-xs text-[var(--wk-text-secondary)]">{analysis.company}</span>
          </div>
        )}
        {analysis.location && (
          <div className="flex items-center gap-2">
            <MapPin className="h-3.5 w-3.5 text-[var(--wk-text-tertiary)]" />
            <span className="text-xs text-[var(--wk-text-secondary)]">{analysis.location}</span>
          </div>
        )}
      </div>

      {/* Requirements */}
      <div>
        <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--wk-text-tertiary)] mb-2">
          Requirements ({analysis.requirements.length})
        </p>
        <div className="space-y-1.5">
          {requirements.map((req, i) => (
            <div
              key={i}
              className="flex items-start gap-2 rounded-[var(--wk-radius-sm)] bg-[var(--wk-surface-sunken)] p-2"
            >
              <div className="flex-1 min-w-0">
                <p className="text-xs text-[var(--wk-text-primary)]">{req.text}</p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Badge
                  variant={IMPORTANCE_COLORS[req.importance]?.variant ?? "info"}
                  className="text-[9px]"
                >
                  {req.importance.replace("_", " ")}
                </Badge>
                <Badge variant="secondary" className="text-[9px]">
                  {CATEGORY_LABELS[req.category] ?? req.category}
                </Badge>
              </div>
            </div>
          ))}
        </div>
        {analysis.requirements.length > 8 && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="mt-1.5 text-xs text-[var(--wk-copilot)] hover:underline cursor-pointer"
          >
            {showAll ? "Show less" : `Show all ${analysis.requirements.length} requirements`}
          </button>
        )}
      </div>

      <Button variant="ghost" size="sm" onClick={onReset} className="w-full">
        Analyze Another Job
      </Button>
    </div>
  );
}
