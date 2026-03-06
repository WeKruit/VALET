import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@valet/ui/components/dialog";
import { Button } from "@valet/ui/components/button";
import { AlertTriangle, Monitor } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { LoadingSpinner } from "@/components/common/loading-spinner";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useCreditBalance } from "../hooks/use-credit-balance";
import { useBatchQueueStore } from "../stores/batch-queue.store";
import { launchProtocolOrFallback } from "../utils/protocol-launch";

interface BatchConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobUrls: string[];
  resumeId: string;
  quality: "speed" | "balanced" | "quality";
  notes?: string;
  targetWorkerId?: string;
  reasoningModel?: string;
  visionModel?: string;
}

export function BatchConfirmDialog({
  open,
  onOpenChange,
  jobUrls,
  resumeId,
  quality,
  notes,
  targetWorkerId,
  reasoningModel,
  visionModel,
}: BatchConfirmDialogProps) {
  const queryClient = useQueryClient();
  const user = useAuth((s) => s.user);
  const isAdmin = user?.role === "admin" || user?.role === "superadmin";
  const { balance, enforcementEnabled } = useCreditBalance();
  const { applyBatchResults, clearSuccessful } = useBatchQueueStore();
  const count = jobUrls.length;
  const insufficientCredits = enforcementEnabled && balance < count;

  const createBatch = api.tasks.createBatch.useMutation({
    onSuccess: (data) => {
      if (data.status === 200) {
        const { summary, results } = data.body;
        applyBatchResults(results);

        // Clear successful items after a brief moment so user sees the status update
        setTimeout(() => clearSuccessful(), 500);

        queryClient.invalidateQueries({ queryKey: ["tasks"] });
        queryClient.invalidateQueries({ queryKey: ["credits", "balance"] });

        if (summary.created === count) {
          toast.success(`All ${summary.created} applications started.`);
        } else {
          toast.info(
            `${summary.created} started, ${summary.failed + summary.duplicates + summary.skipped} failed or skipped.`,
          );
        }
        onOpenChange(false);
      }
    },
    onError: () => {
      toast.error("Batch submission failed. Please try again.");
    },
  });

  const createHandoff = api.desktop.createHandoff.useMutation({
    onSuccess: (data) => {
      if (data.status === 201) {
        toast.success("Sending to desktop app...");
        onOpenChange(false);
        launchProtocolOrFallback(data.body.deepLink, data.body.token);
      }
    },
    onError: () => {
      toast.error("Failed to create handoff. Please try again.");
    },
  });

  const isPending = createBatch.isPending || createHandoff.isPending;

  function handleConfirm() {
    if (insufficientCredits) return;

    if (isAdmin) {
      // Admin: cloud batch dispatch
      createBatch.mutate({
        body: {
          jobUrls,
          resumeId,
          mode: "copilot",
          quality,
          executionTarget: "cloud",
          ...(notes?.trim() ? { notes: notes.trim() } : {}),
          ...(targetWorkerId && targetWorkerId !== "auto" ? { targetWorkerId } : {}),
          ...(reasoningModel && reasoningModel !== "auto" ? { reasoningModel } : {}),
          ...(visionModel && visionModel !== "auto" ? { visionModel } : {}),
        },
      });
    } else {
      // Non-admin: desktop handoff
      createHandoff.mutate({
        body: {
          urls: jobUrls,
          resumeId,
          quality,
          ...(notes?.trim() ? { notes: notes.trim() } : {}),
        },
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isAdmin ? "Confirm Batch Submission" : "Send to Desktop App"}</DialogTitle>
          <DialogDescription>
            {isAdmin ? (
              <>
                {count} application{count > 1 ? "s" : ""} will be submitted. This uses{" "}
                <span className="font-medium text-[var(--wk-text-primary)]">
                  {count} credit{count > 1 ? "s" : ""}
                </span>
                . Balance: {balance}.
              </>
            ) : (
              <>
                {count} URL{count > 1 ? "s" : ""} will be sent to GhostHands Desktop for processing.
                Credits are charged when each application runs.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {insufficientCredits && (
          <div className="flex items-center gap-2 rounded-[var(--wk-radius-lg)] bg-[color-mix(in_srgb,var(--wk-status-error)_8%,transparent)] border border-[color-mix(in_srgb,var(--wk-status-error)_20%,transparent)] px-3 py-2">
            <AlertTriangle className="h-4 w-4 text-[var(--wk-status-error)] shrink-0" />
            <span className="text-sm text-[var(--wk-status-error)]">
              Insufficient credits. You need {count} but have {balance}.
            </span>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button variant="cta" onClick={handleConfirm} disabled={insufficientCredits || isPending}>
            {isPending ? (
              <span className="flex items-center gap-2">
                <LoadingSpinner size="sm" /> {isAdmin ? "Submitting..." : "Sending..."}
              </span>
            ) : isAdmin ? (
              `Run ${count} Application${count > 1 ? "s" : ""}`
            ) : (
              <span className="flex items-center gap-2">
                <Monitor className="h-4 w-4" />
                Send {count} to Desktop
              </span>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
