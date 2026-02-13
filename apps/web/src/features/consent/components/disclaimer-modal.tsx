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
import { ShieldCheck, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import {
  LAYER_1_REGISTRATION,
  LAYER_2_COPILOT_DISCLAIMER,
} from "@/content/legal/consent-text";

interface DisclaimerModalProps {
  step: "tos" | "copilot";
  onTosAccepted: () => void;
  onCopilotAccepted: () => void;
}

export function DisclaimerModal({
  step,
  onTosAccepted,
  onCopilotAccepted,
}: DisclaimerModalProps) {
  const [tosChecked, setTosChecked] = useState(false);
  const [copilotChecked, setCopilotChecked] = useState(false);

  const recordConsent = api.consent.create.useMutation({
    onError: () => {
      toast.error("Failed to record consent. Please try again.");
    },
  });

  async function handleTosAccept() {
    recordConsent.mutate(
      {
        body: {
          type: LAYER_1_REGISTRATION.type,
          version: LAYER_1_REGISTRATION.version,
        },
      },
      {
        onSuccess: (data) => {
          if (data.status === 201) {
            onTosAccepted();
          }
        },
      }
    );
  }

  async function handleCopilotAccept() {
    recordConsent.mutate(
      {
        body: {
          type: LAYER_2_COPILOT_DISCLAIMER.type,
          version: LAYER_2_COPILOT_DISCLAIMER.version,
        },
      },
      {
        onSuccess: (data) => {
          if (data.status === 201) {
            toast.success("Copilot mode enabled. You're all set.");
            onCopilotAccepted();
          }
        },
      }
    );
  }

  if (step === "tos") {
    return (
      <Dialog open>
        <DialogContent
          className="max-w-md"
          hideClose
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-[var(--wk-radius-lg)] bg-[var(--wk-surface-sunken)]">
                <ShieldCheck className="h-5 w-5 text-[var(--wk-text-primary)]" />
              </div>
              <div>
                <DialogTitle>{LAYER_1_REGISTRATION.title}</DialogTitle>
                <DialogDescription className="mt-1">
                  {LAYER_1_REGISTRATION.description}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={tosChecked}
                onChange={(e) => setTosChecked(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-[var(--wk-border-default)] accent-[var(--wk-text-primary)]"
              />
              <span
                className="text-sm leading-relaxed text-[var(--wk-text-primary)]"
                dangerouslySetInnerHTML={{
                  __html: LAYER_1_REGISTRATION.checkboxLabel,
                }}
              />
            </label>
          </div>

          <DialogFooter>
            <Button
              variant="cta"
              className="w-full"
              disabled={!tosChecked || recordConsent.isPending}
              onClick={handleTosAccept}
            >
              {recordConsent.isPending ? "Saving..." : "Accept & Continue"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open>
      <DialogContent
        className="max-w-lg max-h-[85vh] overflow-y-auto"
        hideClose
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[var(--wk-radius-lg)] bg-amber-50">
              <AlertTriangle className="h-5 w-5 text-[var(--wk-status-warning)]" />
            </div>
            <div>
              <DialogTitle>{LAYER_2_COPILOT_DISCLAIMER.title}</DialogTitle>
              <DialogDescription className="mt-1">
                {LAYER_2_COPILOT_DISCLAIMER.preamble}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {LAYER_2_COPILOT_DISCLAIMER.risks.map((risk) => (
            <div
              key={risk.heading}
              className="rounded-[var(--wk-radius-lg)] border border-[var(--wk-border-subtle)] p-3"
            >
              <h4 className="text-sm font-semibold">{risk.heading}</h4>
              <p className="mt-1 text-sm leading-relaxed text-[var(--wk-text-secondary)]">
                {risk.body}
              </p>
            </div>
          ))}
        </div>

        <div className="space-y-4 pt-2 border-t border-[var(--wk-border-subtle)]">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={copilotChecked}
              onChange={(e) => setCopilotChecked(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-[var(--wk-border-default)] accent-[var(--wk-text-primary)]"
            />
            <span className="text-sm leading-relaxed text-[var(--wk-text-primary)]">
              {LAYER_2_COPILOT_DISCLAIMER.checkboxLabel}
            </span>
          </label>
        </div>

        <DialogFooter>
          <Button
            variant="cta"
            className="w-full"
            disabled={!copilotChecked || recordConsent.isPending}
            onClick={handleCopilotAccept}
          >
            {recordConsent.isPending
              ? "Saving..."
              : LAYER_2_COPILOT_DISCLAIMER.acceptLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
