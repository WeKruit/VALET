import { Card, CardContent, CardHeader, CardTitle } from "@valet/ui/components/card";
import { Badge } from "@valet/ui/components/badge";
import {
  Eye,
  ShieldAlert,
  FileCheck,
  HelpCircle,
  Loader2,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";
import { useTask } from "@/features/tasks/hooks/use-tasks";
import { HitlBlockerCard } from "@/features/tasks/components/hitl-blocker-card";
import { ProofPack } from "@/features/tasks/components/proof-pack";
import { FitLabPanel } from "@/features/fit-lab/fit-lab-panel";
import { LoadingSpinner } from "@/components/common/loading-spinner";
import { useWorkbenchStore } from "../stores/workbench.store";
import { api } from "@/lib/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type SidecarPanel = "preview" | "blocker" | "proof" | "help";

const PANEL_TABS: { value: SidecarPanel; label: string; icon: React.ElementType }[] = [
  { value: "preview", label: "Preview", icon: Eye },
  { value: "blocker", label: "Blockers", icon: ShieldAlert },
  { value: "proof", label: "Proof", icon: FileCheck },
  { value: "help", label: "Help", icon: HelpCircle },
];

function PreviewPanel({ taskId }: { taskId: string }) {
  const { data, isLoading } = useTask(taskId);
  const task = data?.status === 200 ? data.body : null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <LoadingSpinner />
      </div>
    );
  }

  if (!task) {
    return (
      <p className="px-4 py-8 text-center text-xs text-[var(--wk-text-tertiary)]">Task not found</p>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <div className="space-y-3">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--wk-text-tertiary)]">
            Status
          </p>
          <div className="mt-1 flex items-center gap-2">
            {task.status === "in_progress" || task.status === "testing" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--wk-copilot)]" />
            ) : task.status === "completed" ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-[var(--wk-status-success)]" />
            ) : null}
            <Badge
              variant={
                task.status === "completed"
                  ? "success"
                  : task.status === "waiting_human"
                    ? "warning"
                    : task.status === "failed"
                      ? "error"
                      : "info"
              }
              className="capitalize"
            >
              {task.status.replace("_", " ")}
            </Badge>
          </div>
        </div>

        {task.jobTitle && (
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--wk-text-tertiary)]">
              Job Title
            </p>
            <p className="mt-0.5 text-sm text-[var(--wk-text-primary)]">{task.jobTitle}</p>
          </div>
        )}

        {task.companyName && (
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--wk-text-tertiary)]">
              Company
            </p>
            <p className="mt-0.5 text-sm text-[var(--wk-text-primary)]">{task.companyName}</p>
          </div>
        )}

        <div>
          <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--wk-text-tertiary)]">
            Platform
          </p>
          <p className="mt-0.5 text-sm capitalize text-[var(--wk-text-primary)]">{task.platform}</p>
        </div>

        <div>
          <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--wk-text-tertiary)]">
            Progress
          </p>
          <div className="mt-1 flex items-center gap-2">
            <div className="h-1.5 flex-1 rounded-full bg-[var(--wk-surface-sunken)] overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[var(--wk-copilot)] to-[var(--wk-accent-teal)] transition-all duration-500"
                style={{ width: `${task.progress}%` }}
              />
            </div>
            <span className="text-xs font-medium text-[var(--wk-text-secondary)]">
              {task.progress}%
            </span>
          </div>
        </div>

        <div>
          <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--wk-text-tertiary)]">
            Job URL
          </p>
          <a
            href={task.jobUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-0.5 flex items-center gap-1 text-xs text-[var(--wk-copilot)] hover:underline"
          >
            <span className="truncate">{task.jobUrl}</span>
            <ExternalLink className="h-3 w-3 shrink-0" />
          </a>
        </div>

        <div>
          <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--wk-text-tertiary)]">
            Mode
          </p>
          <Badge variant={task.mode === "copilot" ? "copilot" : "autopilot"} className="mt-0.5">
            {task.mode}
          </Badge>
        </div>

        {task.fieldsFilled != null && (
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--wk-text-tertiary)]">
              Fields Filled
            </p>
            <p className="mt-0.5 text-sm text-[var(--wk-text-primary)]">{task.fieldsFilled}</p>
          </div>
        )}

        {task.confidenceScore != null && (
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--wk-text-tertiary)]">
              Confidence
            </p>
            <p className="mt-0.5 text-sm text-[var(--wk-text-primary)]">
              {Math.round(task.confidenceScore * 100)}%
            </p>
          </div>
        )}
      </div>

      {/* Fit Lab panel — available when task has a resume */}
      {task.resumeId && (
        <>
          <div className="mx-4 border-t border-[var(--wk-border-subtle)]" />
          <FitLabPanel resumeId={task.resumeId} jobUrl={task.jobUrl} compact />
        </>
      )}
    </div>
  );
}

function BlockerPanel({ taskId }: { taskId: string }) {
  const { data, isLoading } = useTask(taskId);
  const task = data?.status === 200 ? data.body : null;
  const queryClient = useQueryClient();

  const cancelTask = api.tasks.cancel.useMutation({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks", taskId] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Task cancelled.");
    },
    onError: () => {
      toast.error("Failed to cancel task.");
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <LoadingSpinner />
      </div>
    );
  }

  if (!task) return null;

  const isWaiting = task.status === "waiting_human";
  const hasBlocker = isWaiting && task.interaction != null;

  if (!isWaiting) {
    return (
      <div className="px-4 py-8 text-center">
        <CheckCircle2 className="mx-auto h-8 w-8 text-[var(--wk-status-success)]" />
        <p className="mt-2 text-sm text-[var(--wk-text-secondary)]">No blockers for this task</p>
      </div>
    );
  }

  if (!hasBlocker || !task.interaction) {
    return (
      <div className="px-4 py-8 text-center">
        <ShieldAlert className="mx-auto h-8 w-8 text-[var(--wk-status-warning)]" />
        <p className="mt-2 text-sm text-[var(--wk-text-secondary)]">
          This task is waiting for your review
        </p>
        <p className="mt-1 text-xs text-[var(--wk-text-tertiary)]">
          Check the center pane for field review details
        </p>
      </div>
    );
  }

  return (
    <div className="p-3">
      <HitlBlockerCard
        taskId={taskId}
        interaction={{
          type: task.interaction.type,
          screenshotUrl: task.interaction.screenshotUrl,
          pageUrl: task.interaction.pageUrl,
          timeoutSeconds: task.interaction.timeoutSeconds,
          message: task.interaction.message,
          description: task.interaction.description,
          metadata: task.interaction.metadata,
          pausedAt:
            task.interaction.pausedAt instanceof Date
              ? task.interaction.pausedAt.toISOString()
              : String(task.interaction.pausedAt),
        }}
        browserSessionAvailable={task.ghJob?.browserSessionAvailable === true}
        credentialIssue={
          task.interaction.type === "login_required" ||
          (task.interaction.type === "two_factor" &&
            task.interaction.metadata?.detection_method === "credential_failure")
        }
        onCancel={() => cancelTask.mutate({ params: { id: taskId }, body: {} })}
      />
    </div>
  );
}

function ProofPanel({ taskId }: { taskId: string }) {
  const { data, isLoading } = useTask(taskId);
  const task = data?.status === 200 ? data.body : null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <LoadingSpinner />
      </div>
    );
  }

  if (!task) return null;

  const isCompleted = task.status === "completed";

  if (!isCompleted) {
    return (
      <div className="px-4 py-8 text-center">
        <FileCheck className="mx-auto h-8 w-8 text-[var(--wk-text-tertiary)]" />
        <p className="mt-2 text-sm text-[var(--wk-text-secondary)]">
          Proof pack available after submission
        </p>
        <p className="mt-1 text-xs text-[var(--wk-text-tertiary)]">
          Screenshots, filled fields, and confirmation will appear here
        </p>
      </div>
    );
  }

  return <ProofPack taskId={taskId} compact />;
}

function HelpPanel() {
  return (
    <div className="space-y-4 p-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Platform Support</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {[
            { name: "LinkedIn", status: "Supported", color: "success" as const },
            { name: "Greenhouse", status: "Supported", color: "success" as const },
            { name: "Lever", status: "Supported", color: "success" as const },
            { name: "Workday", status: "Supported", color: "success" as const },
          ].map((p) => (
            <div key={p.name} className="flex items-center justify-between">
              <span className="text-sm text-[var(--wk-text-primary)]">{p.name}</span>
              <Badge variant={p.color} className="text-[10px]">
                {p.status}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Quick Tips</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-xs text-[var(--wk-text-secondary)]">
            <li>Paste a job URL from a supported platform to begin</li>
            <li>Select a resume before submitting (uploaded in Settings)</li>
            <li>Copilot mode lets you review all fields before final submission</li>
            <li>Click any task in the left rail to see its live status</li>
            <li>Blockers (captchas, 2FA) appear here for resolution</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function LaunchPreview() {
  return (
    <div className="px-4 py-8 text-center">
      <Eye className="mx-auto h-8 w-8 text-[var(--wk-text-tertiary)]" />
      <p className="mt-2 text-sm text-[var(--wk-text-secondary)]">
        Submit an application to see a preview here
      </p>
      <p className="mt-1 text-xs text-[var(--wk-text-tertiary)]">
        Or select an existing task from the left rail
      </p>
    </div>
  );
}

export function WorkbenchSidecar() {
  const { selectedTaskId, sidecarPanel, setSidecarPanel } = useWorkbenchStore();

  return (
    <div className="flex h-full flex-col border-l border-[var(--wk-border-subtle)] bg-[var(--wk-surface-page)]">
      {/* Panel tabs */}
      <div className="flex border-b border-[var(--wk-border-subtle)]">
        {PANEL_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setSidecarPanel(tab.value)}
            title={tab.label}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 py-2.5 text-[11px] font-medium transition-colors cursor-pointer",
              sidecarPanel === tab.value
                ? "border-b-2 border-[var(--wk-accent-amber)] text-[var(--wk-text-primary)]"
                : "text-[var(--wk-text-tertiary)] hover:text-[var(--wk-text-secondary)]",
            )}
          >
            <tab.icon className="h-3.5 w-3.5" />
            <span className="hidden xl:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Panel content */}
      <div className="flex-1 overflow-y-auto">
        {!selectedTaskId ? (
          sidecarPanel === "help" ? (
            <HelpPanel />
          ) : (
            <LaunchPreview />
          )
        ) : sidecarPanel === "preview" ? (
          <PreviewPanel taskId={selectedTaskId} />
        ) : sidecarPanel === "blocker" ? (
          <BlockerPanel taskId={selectedTaskId} />
        ) : sidecarPanel === "proof" ? (
          <ProofPanel taskId={selectedTaskId} />
        ) : (
          <HelpPanel />
        )}
      </div>
    </div>
  );
}
