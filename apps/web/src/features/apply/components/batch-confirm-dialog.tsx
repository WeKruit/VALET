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
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { LoadingSpinner } from "@/components/common/loading-spinner";
import { useCreditBalance } from "../hooks/use-credit-balance";
import { useBatchQueueStore } from "../stores/batch-queue.store";

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

  function handleConfirm() {
    if (insufficientCredits) return;
    createBatch.mutate({
      body: {
        jobUrls,
        resumeId,
        mode: "copilot",
        quality,
        ...(notes?.trim() ? { notes: notes.trim() } : {}),
        ...(targetWorkerId && targetWorkerId !== "auto" ? { targetWorkerId } : {}),
        ...(reasoningModel && reasoningModel !== "auto" ? { reasoningModel } : {}),
        ...(visionModel && visionModel !== "auto" ? { visionModel } : {}),
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm Batch Submission</DialogTitle>
          <DialogDescription>
            {count} application{count > 1 ? "s" : ""} will be submitted. This uses{" "}
            <span className="font-medium text-[var(--wk-text-primary)]">
              {count} credit{count > 1 ? "s" : ""}
            </span>
            . Balance: {balance}.
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
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={createBatch.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="cta"
            onClick={handleConfirm}
            disabled={insufficientCredits || createBatch.isPending}
          >
            {createBatch.isPending ? (
              <span className="flex items-center gap-2">
                <LoadingSpinner size="sm" /> Submitting...
              </span>
            ) : (
              `Run ${count} Application${count > 1 ? "s" : ""}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
