import { useState } from "react";
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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@valet/ui/components/select";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { LoadingSpinner } from "@/components/common/loading-spinner";
import { useTriggerTask, useTriggerTest } from "../hooks/use-sandboxes";

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
  const [tab, setTab] = useState<string>("test");

  // Quick Test state
  const [searchQuery, setSearchQuery] = useState("valet integration test");

  // Job Application state
  const [jobUrl, setJobUrl] = useState("");
  const [resumeId, setResumeId] = useState("");
  const [mode, setMode] = useState<"autopilot" | "copilot">("autopilot");
  const [notes, setNotes] = useState("");

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

  function handleTestSubmit() {
    triggerTest.mutate(
      {
        params: { id: sandboxId },
        body: { searchQuery: searchQuery.trim() || undefined },
      },
      {
        onSuccess: (data) => {
          if (data.status === 201) {
            toast.success(`Test task created: ${data.body.taskId.slice(0, 8)}...`);
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
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        },
      },
      {
        onSuccess: (data) => {
          if (data.status === 201) {
            toast.success(`Job task created: ${data.body.taskId.slice(0, 8)}...`);
            onOpenChange(false);
            setJobUrl("");
            setNotes("");
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
