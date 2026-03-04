import { useState } from "react";
import { Card, CardContent } from "@valet/ui/components/card";
import { Button } from "@valet/ui/components/button";
import { Lock, Shield, Trash2, ChevronDown, ChevronUp } from "lucide-react";

interface SecurityStepProps {
  onContinue: () => void;
}

const SECURITY_CARDS = [
  {
    icon: Lock,
    title: "Encrypted at Rest",
    description:
      "All credentials are encrypted using AES-256-GCM before storage. The encryption keys are managed by AWS KMS and are never stored alongside the encrypted data. Even our database administrators cannot read your passwords.",
  },
  {
    icon: Shield,
    title: "Minimal Scope",
    description:
      "Your credentials are used exclusively to log in to job platforms and read verification emails. VALET never changes your passwords, sends emails from your account, modifies your profile on these platforms, or accesses anything beyond the job application flow.",
  },
  {
    icon: Trash2,
    title: "You Control the Lifecycle",
    description:
      "You can update or delete any saved credential at any time from Settings. When you delete a credential, it is permanently removed -- not soft-deleted. If you delete your VALET account, all stored credentials are purged within 24 hours.",
  },
] as const;

const TECHNICAL_DETAILS = [
  "Encryption: AES-256-GCM with per-credential IV",
  "Key management: AWS KMS with automatic rotation",
  "Transport: TLS 1.3 in transit",
  "Access: Credentials are decrypted only inside the automation worker's memory during an active application session. They are never logged, cached to disk, or sent to third-party services.",
  "Audit trail: Every credential access is logged with timestamp, purpose, and worker ID",
] as const;

export function SecurityStep({ onContinue }: SecurityStepProps) {
  const [showTechnical, setShowTechnical] = useState(false);

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="text-center space-y-2">
        <h2 className="font-display text-xl font-semibold">Your credentials are safe with us</h2>
        <p className="text-sm text-[var(--wk-text-secondary)]">
          Here's exactly what happens with the logins you saved.
        </p>
      </div>

      <div className="space-y-3">
        {SECURITY_CARDS.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.title}>
              <CardContent className="p-5 flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--wk-radius-lg)] bg-[var(--wk-surface-sunken)]">
                  <Icon className="h-5 w-5 text-[var(--wk-text-primary)]" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold">{card.title}</h3>
                  <p className="mt-1 text-xs text-[var(--wk-text-secondary)] leading-relaxed">
                    {card.description}
                  </p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Technical details collapsible */}
      <div>
        <button
          type="button"
          className="flex items-center gap-2 text-xs text-[var(--wk-text-tertiary)] hover:text-[var(--wk-text-secondary)] mx-auto"
          onClick={() => setShowTechnical(!showTechnical)}
        >
          {showTechnical ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
          Technical details
        </button>

        {showTechnical && (
          <Card className="mt-2">
            <CardContent className="p-4">
              <ul className="text-xs text-[var(--wk-text-tertiary)] space-y-1.5 list-disc ml-4">
                {TECHNICAL_DETAILS.map((detail) => (
                  <li key={detail}>{detail}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>

      <Button variant="cta" size="lg" className="w-full" onClick={onContinue}>
        Got It
      </Button>
    </div>
  );
}
