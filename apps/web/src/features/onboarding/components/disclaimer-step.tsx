import { useState } from "react";
import { Card, CardContent } from "@valet/ui/components/card";
import { Button } from "@valet/ui/components/button";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import {
  LAYER_2_COPILOT_DISCLAIMER,
} from "@/content/legal/consent-text";

interface DisclaimerStepProps {
  onAccepted: () => void;
}

export function DisclaimerStep({ onAccepted }: DisclaimerStepProps) {
  const [disclaimerChecked, setDisclaimerChecked] = useState(false);
  const [tosChecked, setTosChecked] = useState(false);

  const recordConsent = api.consent.create.useMutation({
    onError: () => {
      toast.error("Failed to record consent. Please try again.");
    },
  });

  function handleAccept() {
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
            toast.success("You're all set! Welcome to WeKruit.");
            onAccepted();
          }
        },
      }
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="text-center space-y-2">
        <h2 className="font-display text-xl font-semibold">
          Before We Begin
        </h2>
        <p className="text-sm text-[var(--wk-text-secondary)]">
          Please review and accept the following to start using Valet.
        </p>
      </div>

      <Card>
        <CardContent className="p-6 space-y-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--wk-radius-lg)] bg-[var(--wk-surface-sunken)]">
              <ShieldCheck className="h-5 w-5 text-[var(--wk-text-primary)]" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">
                {LAYER_2_COPILOT_DISCLAIMER.title}
              </h3>
              <p className="text-xs text-[var(--wk-text-secondary)] mt-0.5">
                {LAYER_2_COPILOT_DISCLAIMER.preamble}
              </p>
            </div>
          </div>

          <div className="space-y-2.5">
            {LAYER_2_COPILOT_DISCLAIMER.risks.map((risk) => (
              <div
                key={risk.heading}
                className="rounded-[var(--wk-radius-lg)] border border-[var(--wk-border-subtle)] p-3"
              >
                <h4 className="text-xs font-semibold">{risk.heading}</h4>
                <p className="mt-1 text-xs leading-relaxed text-[var(--wk-text-secondary)]">
                  {risk.body}
                </p>
              </div>
            ))}
          </div>

          <div className="space-y-3 pt-2 border-t border-[var(--wk-border-subtle)]">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={disclaimerChecked}
                onChange={(e) => setDisclaimerChecked(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-[var(--wk-border-default)] accent-[var(--wk-text-primary)]"
              />
              <span className="text-sm leading-relaxed text-[var(--wk-text-primary)]">
                I understand that Valet will automate job applications on my
                behalf
              </span>
            </label>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={tosChecked}
                onChange={(e) => setTosChecked(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-[var(--wk-border-default)] accent-[var(--wk-text-primary)]"
              />
              <span className="text-sm leading-relaxed text-[var(--wk-text-primary)]">
                I accept the{" "}
                <a
                  href="/legal/terms"
                  target="_blank"
                  className="underline underline-offset-2"
                >
                  Terms of Service
                </a>{" "}
                and{" "}
                <a
                  href="/legal/privacy"
                  target="_blank"
                  className="underline underline-offset-2"
                >
                  Privacy Policy
                </a>
              </span>
            </label>
          </div>
        </CardContent>
      </Card>

      <Button
        variant="cta"
        size="lg"
        className="w-full"
        disabled={!disclaimerChecked || !tosChecked || recordConsent.isPending}
        onClick={handleAccept}
      >
        {recordConsent.isPending ? "Saving..." : "Accept & Get Started"}
      </Button>
    </div>
  );
}
