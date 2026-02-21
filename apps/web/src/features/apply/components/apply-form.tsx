import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Card, CardContent } from "@valet/ui/components/card";
import { Input } from "@valet/ui/components/input";
import { Textarea } from "@valet/ui/components/textarea";
import { Button } from "@valet/ui/components/button";
import { Badge } from "@valet/ui/components/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@valet/ui/components/select";
import {
  Link2,
  Sparkles,
  Zap,
  FileText,
  AlertTriangle,
  StickyNote,
  Briefcase,
  Globe,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { LoadingSpinner } from "@/components/common/loading-spinner";
import { cn } from "@/lib/utils";
import { QualitySelector } from "./quality-selector";

type PlatformInfo = {
  name: string;
  color: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
};

const PLATFORM_MAP: Record<string, PlatformInfo> = {
  LinkedIn: {
    name: "LinkedIn",
    color: "blue",
    bgClass: "bg-blue-50",
    textClass: "text-blue-700",
    borderClass: "border-blue-200",
  },
  Greenhouse: {
    name: "Greenhouse",
    color: "green",
    bgClass: "bg-emerald-50",
    textClass: "text-emerald-700",
    borderClass: "border-emerald-200",
  },
  Lever: {
    name: "Lever",
    color: "purple",
    bgClass: "bg-purple-50",
    textClass: "text-purple-700",
    borderClass: "border-purple-200",
  },
  Workday: {
    name: "Workday",
    color: "orange",
    bgClass: "bg-orange-50",
    textClass: "text-orange-700",
    borderClass: "border-orange-200",
  },
};

function detectPlatform(url: string): string | null {
  if (url.includes("linkedin.com")) return "LinkedIn";
  if (url.includes("greenhouse.io")) return "Greenhouse";
  if (url.includes("lever.co")) return "Lever";
  if (url.includes("workday.com") || url.includes("myworkday.com")) return "Workday";
  return null;
}

function isValidJobUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && Boolean(detectPlatform(url));
  } catch {
    return false;
  }
}

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function ApplyForm() {
  const [url, setUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [quality, setQuality] = useState<"speed" | "balanced" | "quality">("balanced");
  const [selectedResumeId, setSelectedResumeId] = useState<string>("");
  const navigate = useNavigate();

  const { data: resumesData, isLoading: resumesLoading } = api.resumes.list.useQuery({
    queryKey: ["resumes"],
    queryData: {},
    staleTime: 1000 * 60 * 5,
    refetchInterval: (query) => {
      const resumes = query.state.data?.status === 200 ? query.state.data.body.data : [];
      return resumes.some((r) => r.status === "parsing" || r.status === "uploading") ? 3000 : false;
    },
  });

  const resumes = resumesData?.status === 200 ? resumesData.body.data : [];
  const readyResumes = resumes.filter((r) => r.status === "parsed");
  const defaultResume = readyResumes.find((r) => r.isDefault) ?? readyResumes[0] ?? null;

  // Auto-select default resume when loaded (only from parsed resumes)
  const activeResumeId = selectedResumeId || defaultResume?.id || "";
  const activeResume = readyResumes.find((r) => r.id === activeResumeId) ?? null;
  const hasStuckResumes = resumes.some(
    (r) => r.status === "parsing" || r.status === "parse_failed",
  );

  const createTask = api.tasks.create.useMutation({
    onSuccess: (data) => {
      if (data.status === 201) {
        toast.success("Application started. Redirecting to task view.");
        navigate(`/tasks/${data.body.id}`);
      }
    },
    onError: () => {
      toast.error("Failed to create application. Please try again.");
    },
  });

  const platform = url ? detectPlatform(url) : null;
  const platformInfo = platform ? PLATFORM_MAP[platform] : null;
  const isValid = url ? isValidJobUrl(url) : false;
  const isUnsupported = url.length > 10 && isValidUrl(url) && !platform;

  async function handleSubmit() {
    if (!isValid) return;

    if (!activeResume) {
      toast.error("Please upload a resume first in Settings before applying.");
      return;
    }

    createTask.mutate({
      body: {
        jobUrl: url,
        mode: "copilot",
        resumeId: activeResume.id,
        quality,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      },
    });
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Hero card */}
      <Card>
        <CardContent className="p-5 sm:p-8">
          <div className="text-center space-y-2 mb-8">
            <div className="flex justify-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-[var(--wk-radius-2xl)] bg-[var(--wk-surface-sunken)]">
                <Sparkles className="h-6 w-6 text-[var(--wk-accent-amber)]" />
              </div>
            </div>
            <h2 className="font-display text-xl font-semibold">Ready to apply to your next job!</h2>
            <p className="text-sm text-[var(--wk-text-secondary)]">
              Paste a job URL below. We'll fill the application and show you every field before
              submitting.
            </p>
          </div>

          {/* URL input section */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-[var(--wk-text-primary)]">Job URL</label>
            <div className="relative">
              <Link2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--wk-text-tertiary)]" />
              <Input
                type="url"
                placeholder="https://www.linkedin.com/jobs/view/..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className={cn(
                  "pl-10",
                  url && !isValid && isValidUrl(url) && "border-[var(--wk-status-warning)]",
                  url && isValid && "border-[var(--wk-status-success)]",
                )}
              />
            </div>

            {/* Platform detection badge */}
            {platformInfo && (
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-[var(--wk-radius-full)] px-2.5 py-0.5 text-xs font-medium border",
                    platformInfo.bgClass,
                    platformInfo.textClass,
                    platformInfo.borderClass,
                  )}
                >
                  <Briefcase className="h-3 w-3" />
                  {platformInfo.name}
                </span>
                {platform === "LinkedIn" && (
                  <span className="text-xs text-[var(--wk-text-secondary)]">
                    Easy Apply detected
                  </span>
                )}
              </div>
            )}

            {/* Unsupported platform warning */}
            {isUnsupported && (
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-[var(--wk-radius-full)] px-2.5 py-0.5 text-xs font-medium border bg-[var(--wk-surface-sunken)] text-[var(--wk-text-secondary)] border-[var(--wk-border-default)]">
                  <Globe className="h-3 w-3" />
                  External
                </span>
                <span className="text-xs text-[var(--wk-status-warning)]">
                  Unsupported platform -- only LinkedIn, Greenhouse, Lever, and Workday are
                  supported.
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Resume selector card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-2 mb-3">
            <FileText className="h-4 w-4 text-[var(--wk-text-secondary)]" />
            <label className="text-sm font-medium text-[var(--wk-text-primary)]">Resume</label>
          </div>

          {resumesLoading ? (
            <div className="flex items-center gap-2 text-sm text-[var(--wk-text-secondary)]">
              <LoadingSpinner size="sm" />
              Loading resumes...
            </div>
          ) : resumes.length === 0 ? (
            <div className="flex items-start gap-3 p-4 rounded-[var(--wk-radius-lg)] bg-[var(--wk-surface-sunken)] border border-[var(--wk-border-subtle)]">
              <AlertTriangle className="h-5 w-5 text-[var(--wk-status-warning)] shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-[var(--wk-text-primary)]">
                  No resumes uploaded
                </p>
                <p className="text-sm text-[var(--wk-text-secondary)]">
                  Upload one in{" "}
                  <Link
                    to="/settings"
                    className="text-[var(--wk-copilot)] hover:underline font-medium"
                  >
                    Settings
                  </Link>{" "}
                  first to start applying.
                </p>
              </div>
            </div>
          ) : readyResumes.length === 0 ? (
            <div className="flex items-start gap-3 p-4 rounded-[var(--wk-radius-lg)] bg-amber-50 border border-amber-200">
              <AlertTriangle className="h-5 w-5 text-[var(--wk-status-warning)] shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-[var(--wk-text-primary)]">
                  No resumes ready
                </p>
                <p className="text-sm text-[var(--wk-text-secondary)]">
                  {resumes.length} resume{resumes.length > 1 ? "s" : ""} uploaded but{" "}
                  {resumes.some((r) => r.status === "parsing")
                    ? "still processing"
                    : "failed to parse"}
                  . Go to{" "}
                  <Link
                    to="/settings"
                    className="text-[var(--wk-copilot)] hover:underline font-medium"
                  >
                    Settings
                  </Link>{" "}
                  to retry or delete, then re-upload.
                </p>
              </div>
            </div>
          ) : (
            <>
              <Select value={activeResumeId} onValueChange={setSelectedResumeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a resume" />
                </SelectTrigger>
                <SelectContent>
                  {readyResumes.map((resume) => (
                    <SelectItem key={resume.id} value={resume.id}>
                      <div className="flex items-center gap-2">
                        <span>{resume.filename}</span>
                        {resume.isDefault && (
                          <Badge variant="info" className="text-[10px] px-1.5 py-0">
                            Default
                          </Badge>
                        )}
                        <Badge variant="success" className="text-[10px] px-1.5 py-0">
                          Ready
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {hasStuckResumes && (
                <p className="text-xs text-[var(--wk-text-tertiary)] mt-1">
                  {resumes.length - readyResumes.length} resume
                  {resumes.length - readyResumes.length > 1 ? "s" : ""} still processing or failed.{" "}
                  <Link to="/settings" className="text-[var(--wk-copilot)] hover:underline">
                    Manage in Settings
                  </Link>
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Quality preset card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="h-4 w-4 text-[var(--wk-text-secondary)]" />
            <label className="text-sm font-medium text-[var(--wk-text-primary)]">Quality</label>
          </div>
          <QualitySelector value={quality} onChange={setQuality} />
        </CardContent>
      </Card>

      {/* Notes card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-2 mb-3">
            <StickyNote className="h-4 w-4 text-[var(--wk-text-secondary)]" />
            <label className="text-sm font-medium text-[var(--wk-text-primary)]">
              Notes
              <span className="font-normal text-[var(--wk-text-tertiary)] ml-1">(optional)</span>
            </label>
          </div>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add notes about this application (optional)..."
            maxLength={1000}
            rows={3}
            className="resize-none"
          />
          {notes.length > 0 && (
            <p className="text-xs text-[var(--wk-text-tertiary)] mt-1 text-right">
              {notes.length}/1000
            </p>
          )}
        </CardContent>
      </Card>

      {/* Mode indicator + submit */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center gap-2 text-sm text-[var(--wk-text-secondary)]">
            <Zap className="h-4 w-4 text-[var(--wk-copilot)]" />
            <span>
              Your application is in{" "}
              <span className="font-medium text-[var(--wk-copilot)]">Copilot mode</span> -- you
              review everything before submit.
            </span>
          </div>

          <Button
            variant="cta"
            size="lg"
            className="w-full"
            disabled={!isValid || createTask.isPending || resumesLoading || !activeResume}
            onClick={handleSubmit}
          >
            {resumesLoading ? (
              <span className="flex items-center gap-2">
                <LoadingSpinner size="sm" /> Loading...
              </span>
            ) : createTask.isPending ? (
              "Starting..."
            ) : (
              "Start Application"
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Sample jobs */}
      <Card>
        <CardContent className="p-6">
          <p className="text-xs font-medium text-[var(--wk-text-tertiary)] uppercase tracking-wider mb-1">
            Demo URLs
          </p>
          <p className="text-xs text-[var(--wk-text-tertiary)] mb-3">
            These are placeholder URLs to test platform detection. Replace with a real job listing
            to apply.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              onClick={() => setUrl("https://www.linkedin.com/jobs/view/12345")}
              className="flex items-center gap-2 p-2.5 rounded-[var(--wk-radius-lg)] text-left text-sm cursor-pointer hover:bg-[var(--wk-surface-raised)] transition-colors duration-150"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-[var(--wk-radius-md)] bg-blue-50 border border-blue-200">
                <Briefcase className="h-3 w-3 text-blue-700" />
              </span>
              <span className="text-[var(--wk-text-secondary)]">LinkedIn Easy Apply</span>
            </button>
            <button
              onClick={() => setUrl("https://boards.greenhouse.io/company/jobs/12345")}
              className="flex items-center gap-2 p-2.5 rounded-[var(--wk-radius-lg)] text-left text-sm cursor-pointer hover:bg-[var(--wk-surface-raised)] transition-colors duration-150"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-[var(--wk-radius-md)] bg-emerald-50 border border-emerald-200">
                <Briefcase className="h-3 w-3 text-emerald-700" />
              </span>
              <span className="text-[var(--wk-text-secondary)]">Greenhouse</span>
            </button>
            <button
              onClick={() => setUrl("https://jobs.lever.co/company/12345")}
              className="flex items-center gap-2 p-2.5 rounded-[var(--wk-radius-lg)] text-left text-sm cursor-pointer hover:bg-[var(--wk-surface-raised)] transition-colors duration-150"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-[var(--wk-radius-md)] bg-purple-50 border border-purple-200">
                <Briefcase className="h-3 w-3 text-purple-700" />
              </span>
              <span className="text-[var(--wk-text-secondary)]">Lever</span>
            </button>
            <button
              onClick={() => setUrl("https://myworkday.com/example/d/job-posting/12345")}
              className="flex items-center gap-2 p-2.5 rounded-[var(--wk-radius-lg)] text-left text-sm cursor-pointer hover:bg-[var(--wk-surface-raised)] transition-colors duration-150"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-[var(--wk-radius-md)] bg-orange-50 border border-orange-200">
                <Briefcase className="h-3 w-3 text-orange-700" />
              </span>
              <span className="text-[var(--wk-text-secondary)]">Workday</span>
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
