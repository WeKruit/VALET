import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@valet/ui/components/dialog";
import { Button } from "@valet/ui/components/button";
import { Input } from "@valet/ui/components/input";
import { Textarea } from "@valet/ui/components/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@valet/ui/components/tabs";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@valet/ui/components/select";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { LoadingSpinner } from "@/components/common/loading-spinner";
import { useTriggerTask, useTriggerTest } from "../hooks/use-sandboxes";
import { QualitySelector } from "../../apply/components/quality-selector";

// ─── Model options from GH integration contract (Section 4.1.1) ───
// Grouped by tier for easy selection. "auto" = let GH use its default.

interface ModelOption {
  value: string;
  label: string;
  vision: boolean;
}

const RECOMMENDED_MODELS: ModelOption[] = [
  { value: "qwen-72b", label: "Qwen 72B (default)", vision: true },
  { value: "qwen3-235b", label: "Qwen3 235B (balanced)", vision: true },
  { value: "qwen3-vl-235b-thinking", label: "Qwen3 VL 235B Thinking (quality)", vision: true },
  { value: "gpt-4.1", label: "GPT-4.1 (quality)", vision: true },
  { value: "claude-opus", label: "Claude Opus (premium)", vision: true },
  { value: "gpt-5.2", label: "GPT-5.2 (premium)", vision: true },
];

const BUDGET_MODELS: ModelOption[] = [
  { value: "qwen-7b", label: "Qwen 7B (speed)", vision: true },
  { value: "qwen3-8b", label: "Qwen3 8B", vision: true },
  { value: "qwen3-32b", label: "Qwen3 32B", vision: true },
  { value: "deepseek-chat", label: "DeepSeek Chat (text-only)", vision: false },
  { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash", vision: true },
  { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash", vision: true },
  { value: "gpt-4o-mini", label: "GPT-4o Mini", vision: true },
  { value: "claude-haiku", label: "Claude Haiku", vision: true },
];

const OTHER_MODELS: ModelOption[] = [
  { value: "qwen3-vl-30b-thinking", label: "Qwen3 VL 30B Thinking", vision: true },
  { value: "qwen3-vl-30b", label: "Qwen3 VL 30B", vision: true },
  { value: "qwen3-235b-thinking", label: "Qwen3 235B Thinking (text-only)", vision: false },
  { value: "qwen3-coder-480b", label: "Qwen3 Coder 480B (text-only)", vision: false },
  { value: "qwen3-next-80b", label: "Qwen3 Next 80B (text-only)", vision: false },
  { value: "claude-sonnet", label: "Claude Sonnet", vision: true },
  { value: "gpt-4o", label: "GPT-4o", vision: true },
  { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro", vision: true },
  { value: "deepseek-reasoner", label: "DeepSeek Reasoner (text-only)", vision: false },
];

// ─── Shared model selector component ───

function ModelSelectors({
  reasoningModel,
  onReasoningModelChange,
  visionModel,
  onVisionModelChange,
}: {
  reasoningModel: string;
  onReasoningModelChange: (v: string) => void;
  visionModel: string;
  onVisionModelChange: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-[var(--wk-text-primary)]">Reasoning Model</label>
        <Select value={reasoningModel} onValueChange={onReasoningModelChange}>
          <SelectTrigger>
            <SelectValue placeholder="Auto (default)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">Auto (default)</SelectItem>
            <SelectGroup>
              <SelectLabel>Recommended</SelectLabel>
              {RECOMMENDED_MODELS.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectGroup>
            <SelectGroup>
              <SelectLabel>Budget</SelectLabel>
              {BUDGET_MODELS.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectGroup>
            <SelectGroup>
              <SelectLabel>Other</SelectLabel>
              {OTHER_MODELS.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-[var(--wk-text-primary)]">Vision Model</label>
        <Select value={visionModel} onValueChange={onVisionModelChange}>
          <SelectTrigger>
            <SelectValue placeholder="Auto (default)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">Auto (default)</SelectItem>
            <SelectGroup>
              <SelectLabel>Recommended</SelectLabel>
              {RECOMMENDED_MODELS.filter((m) => m.vision).map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectGroup>
            <SelectGroup>
              <SelectLabel>Budget (vision)</SelectLabel>
              {BUDGET_MODELS.filter((m) => m.vision).map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectGroup>
            <SelectGroup>
              <SelectLabel>Other (vision)</SelectLabel>
              {OTHER_MODELS.filter((m) => m.vision).map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

// ─── Inline copy button for IDs ───

function InlineCopyId({ value, label }: { value: string; label?: string }) {
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(value);
    toast.success("Copied to clipboard");
  }, [value]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-1 rounded px-1 py-0.5 font-mono text-xs text-[var(--wk-text-secondary)] hover:bg-[var(--wk-surface-hover)] hover:text-[var(--wk-text-primary)] transition-colors"
      title="Click to copy"
    >
      {label && <span className="text-[var(--wk-text-tertiary)]">{label}</span>}
      <span>{value}</span>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="opacity-50"
      >
        <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
        <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
      </svg>
    </button>
  );
}

interface TriggerTaskDialogProps {
  sandboxId: string;
  sandboxName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTestTriggered?: () => void;
}

export function TriggerTaskDialog({
  sandboxId,
  sandboxName,
  open,
  onOpenChange,
  onTestTriggered,
}: TriggerTaskDialogProps) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<string>("test");

  // Quick Test state
  const [searchQuery, setSearchQuery] = useState("valet integration test");

  // Job Application state
  const [jobUrl, setJobUrl] = useState("");
  const [resumeId, setResumeId] = useState("");
  const [mode, setMode] = useState<"autopilot" | "copilot">("autopilot");
  const [notes, setNotes] = useState("");
  const [quality, setQuality] = useState<"speed" | "balanced" | "quality">("balanced");

  // Shared model state (used by both tabs)
  const [reasoningModel, setReasoningModel] = useState<string>("auto");
  const [visionModel, setVisionModel] = useState<string>("auto");

  const triggerTask = useTriggerTask();
  const triggerTest = useTriggerTest();

  const { data: resumesData, isLoading: resumesLoading } = api.resumes.list.useQuery({
    queryKey: ["resumes", "trigger-task"],
    queryData: {},
    staleTime: 1000 * 60 * 5,
  });

  const resumes = resumesData?.status === 200 ? resumesData.body.data : [];
  const readyResumes = resumes.filter((r) => r.status === "parsed");
  const activeResumeId =
    resumeId || readyResumes.find((r) => r.isDefault)?.id || readyResumes[0]?.id || "";

  function showTaskCreatedToast(taskId: string, label: string) {
    toast.success(
      <div className="flex flex-col gap-1">
        <span>{label}</span>
        <code className="rounded bg-[var(--wk-surface-sunken)] px-1.5 py-0.5 font-mono text-xs">
          {taskId}
        </code>
        <button
          type="button"
          className="mt-1 text-xs font-medium text-[var(--wk-brand-primary)] hover:underline text-left"
          onClick={() => navigate(`/tasks/${taskId}`)}
        >
          View Task →
        </button>
      </div>,
      { duration: 8000 },
    );
  }

  function handleTestSubmit() {
    triggerTest.mutate(
      {
        params: { id: sandboxId },
        body: {
          searchQuery: searchQuery.trim() || undefined,
          ...(reasoningModel && reasoningModel !== "auto" ? { reasoningModel } : {}),
          ...(visionModel && visionModel !== "auto" ? { visionModel } : {}),
        },
      },
      {
        onSuccess: (data) => {
          if (data.status === 201) {
            showTaskCreatedToast(data.body.taskId, "Test task created");
            onOpenChange(false);
            onTestTriggered?.();
          }
        },
        onError: () => {
          toast.error("Failed to trigger test task.");
        },
      },
    );
  }

  function handleJobSubmit() {
    if (!jobUrl.trim() || !activeResumeId) return;

    triggerTask.mutate(
      {
        params: { id: sandboxId },
        body: {
          jobUrl: jobUrl.trim(),
          resumeId: activeResumeId,
          mode,
          quality,
          ...(notes.trim() ? { notes: notes.trim() } : {}),
          ...(reasoningModel && reasoningModel !== "auto" ? { reasoningModel } : {}),
          ...(visionModel && visionModel !== "auto" ? { visionModel } : {}),
        },
      },
      {
        onSuccess: (data) => {
          if (data.status === 201) {
            showTaskCreatedToast(data.body.taskId, "Job task created");
            onOpenChange(false);
            setJobUrl("");
            setNotes("");
            setReasoningModel("auto");
            setVisionModel("auto");
            onTestTriggered?.();
          }
        },
        onError: () => {
          toast.error("Failed to trigger job task.");
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Trigger Task</DialogTitle>
          <DialogDescription>
            Run a task on sandbox{" "}
            <span className="font-medium text-[var(--wk-text-primary)]">{sandboxName}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 rounded-[var(--wk-radius-md)] border border-[var(--wk-border-default)] bg-[var(--wk-surface-sunken)] px-3 py-2 text-xs text-[var(--wk-text-secondary)]">
          <span>Target:</span>
          <span className="font-semibold text-[var(--wk-text-primary)]">{sandboxName}</span>
          <InlineCopyId value={sandboxId} />
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full">
            <TabsTrigger value="test" className="flex-1">
              Quick Test
            </TabsTrigger>
            <TabsTrigger value="job" className="flex-1">
              Job Application
            </TabsTrigger>
          </TabsList>

          {/* ─── Quick Test ─── */}
          <TabsContent value="test">
            <div className="space-y-4 py-2">
              <p className="text-sm text-[var(--wk-text-secondary)]">
                Runs a Google search on the sandbox worker to verify the end-to-end pipeline is
                working. Watch the result in the Live View below.
              </p>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-[var(--wk-text-primary)]">
                  Search Query
                </label>
                <Input
                  placeholder="valet integration test"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <ModelSelectors
                reasoningModel={reasoningModel}
                onReasoningModelChange={setReasoningModel}
                visionModel={visionModel}
                onVisionModelChange={setVisionModel}
              />
            </div>
            <DialogFooter className="mt-4">
              <Button variant="secondary" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleTestSubmit} disabled={triggerTest.isPending}>
                {triggerTest.isPending ? (
                  <>
                    <LoadingSpinner size="sm" />
                    Running...
                  </>
                ) : (
                  "Run Test"
                )}
              </Button>
            </DialogFooter>
          </TabsContent>

          {/* ─── Job Application ─── */}
          <TabsContent value="job">
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-[var(--wk-text-primary)]">
                  Job URL <span className="text-[var(--wk-status-error)]">*</span>
                </label>
                <Input
                  placeholder="https://boards.greenhouse.io/company/jobs/123"
                  value={jobUrl}
                  onChange={(e) => setJobUrl(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-[var(--wk-text-primary)]">
                  Resume <span className="text-[var(--wk-status-error)]">*</span>
                </label>
                {resumesLoading ? (
                  <div className="flex items-center gap-2 text-sm text-[var(--wk-text-secondary)]">
                    <LoadingSpinner size="sm" /> Loading resumes...
                  </div>
                ) : readyResumes.length === 0 ? (
                  <p className="text-sm text-[var(--wk-status-error)]">
                    No parsed resumes available.
                  </p>
                ) : (
                  <Select value={activeResumeId} onValueChange={setResumeId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a resume" />
                    </SelectTrigger>
                    <SelectContent>
                      {readyResumes.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.filename}
                          {r.isDefault ? " (default)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-[var(--wk-text-primary)]">Mode</label>
                <Select value={mode} onValueChange={(v) => setMode(v as "autopilot" | "copilot")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="autopilot">Autopilot</SelectItem>
                    <SelectItem value="copilot">Copilot</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-[var(--wk-text-primary)]">Quality</label>
                <QualitySelector value={quality} onChange={setQuality} compact />
              </div>

              <ModelSelectors
                reasoningModel={reasoningModel}
                onReasoningModelChange={setReasoningModel}
                visionModel={visionModel}
                onVisionModelChange={setVisionModel}
              />

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-[var(--wk-text-primary)]">Notes</label>
                <Textarea
                  placeholder="Optional notes..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                />
              </div>
            </div>
            <DialogFooter className="mt-4">
              <Button variant="secondary" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleJobSubmit}
                disabled={!jobUrl.trim() || !activeResumeId || triggerTask.isPending}
              >
                {triggerTask.isPending ? (
                  <>
                    <LoadingSpinner size="sm" />
                    Submitting...
                  </>
                ) : (
                  "Submit Job"
                )}
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
