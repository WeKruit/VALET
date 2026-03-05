import { Card, CardContent } from "@valet/ui/components/card";
import { Button } from "@valet/ui/components/button";
import { Badge } from "@valet/ui/components/badge";
import {
  Check,
  AlertTriangle,
  Zap,
  HandHelping,
  MousePointerClick,
  FileText,
  User,
  Mail,
  KeyRound,
  Briefcase,
  ShieldCheck,
} from "lucide-react";
import type { AutonomyLevel } from "@valet/shared/schemas";

interface ChecklistItem {
  label: string;
  complete: boolean;
  note?: string;
  icon: React.ElementType;
}

interface DowngradeReason {
  from: AutonomyLevel;
  to: AutonomyLevel;
  message: string;
}

interface ReadinessResultStepProps {
  autonomyLevel: AutonomyLevel;
  checklist: {
    resumeUploaded: boolean;
    profileComplete: boolean;
    mailboxConnected: boolean;
    credentialsSaved: string[];
    preferencesSet: boolean;
    consentAccepted: boolean;
  };
  downgrades: DowngradeReason[];
  onEnterWorkbench: () => void;
  onGoBack: (step: "qa" | "gmail" | "credentials") => void;
  isSubmitting?: boolean;
}

const LEVEL_CONFIG: Record<
  AutonomyLevel,
  {
    badge: string;
    badgeVariant: "success" | "default" | "warning";
    heading: string;
    body: string;
    icon: React.ElementType;
    color: string;
    bg: string;
  }
> = {
  full: {
    badge: "Full Auto",
    badgeVariant: "success",
    heading: "You're set up for full autonomy",
    body: "VALET can handle everything -- logging in, filling applications, reading verification codes, and submitting. You'll review a summary of each application after it's submitted.",
    icon: Zap,
    color: "text-emerald-600",
    bg: "bg-emerald-50",
  },
  assisted: {
    badge: "Assisted",
    badgeVariant: "default",
    heading: "You're set up for assisted mode",
    body: "VALET can log in and fill applications, but will need your help with verification codes. You'll get a notification when VALET needs you.",
    icon: HandHelping,
    color: "text-blue-600",
    bg: "bg-blue-50",
  },
  copilot_only: {
    badge: "Copilot",
    badgeVariant: "warning",
    heading: "You're set up for copilot mode",
    body: "VALET will fill in application fields for you, but you'll need to log in to each platform yourself and approve each submission.",
    icon: MousePointerClick,
    color: "text-gray-600",
    bg: "bg-gray-100",
  },
};

export function ReadinessResultStep({
  autonomyLevel,
  checklist,
  downgrades,
  onEnterWorkbench,
  onGoBack,
  isSubmitting,
}: ReadinessResultStepProps) {
  const config = LEVEL_CONFIG[autonomyLevel];
  const LevelIcon = config.icon;

  const items: ChecklistItem[] = [
    {
      label: "Resume uploaded",
      complete: checklist.resumeUploaded,
      icon: FileText,
    },
    {
      label: "Profile complete",
      complete: checklist.profileComplete,
      icon: User,
    },
    {
      label: "Gmail connected",
      complete: checklist.mailboxConnected,
      icon: Mail,
      note: checklist.mailboxConnected
        ? undefined
        : "Not connected. VALET will pause for verification codes.",
    },
    {
      label: "Platform credentials saved",
      complete: checklist.credentialsSaved.length > 0,
      icon: KeyRound,
      note:
        checklist.credentialsSaved.length > 0
          ? checklist.credentialsSaved.join(", ")
          : "No platform credentials saved. VALET will ask you to log in each time.",
    },
    {
      label: "Job preferences set",
      complete: checklist.preferencesSet,
      icon: Briefcase,
    },
    {
      label: "Disclaimer accepted",
      complete: checklist.consentAccepted,
      icon: ShieldCheck,
    },
  ];

  return (
    <div className="max-w-lg mx-auto space-y-6">
      {/* Level badge + heading */}
      <div className="text-center space-y-3">
        <div className="flex justify-center">
          <div className={`flex h-14 w-14 items-center justify-center rounded-full ${config.bg}`}>
            <LevelIcon className={`h-7 w-7 ${config.color}`} />
          </div>
        </div>
        <div>
          <Badge variant={config.badgeVariant} className="mb-2">
            {config.badge}
          </Badge>
          <h2 className="font-display text-xl font-semibold">{config.heading}</h2>
          <p className="text-sm text-[var(--wk-text-secondary)] mt-1">{config.body}</p>
        </div>
      </div>

      {/* Checklist */}
      <Card>
        <CardContent className="p-5 space-y-3">
          {items.map((item) => {
            return (
              <div key={item.label} className="flex items-start gap-3">
                <div
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full mt-0.5 ${
                    item.complete
                      ? "bg-emerald-50 text-[var(--wk-status-success)]"
                      : "bg-amber-50 text-amber-600"
                  }`}
                >
                  {item.complete ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <AlertTriangle className="h-3.5 w-3.5" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-sm ${item.complete ? "text-[var(--wk-text-primary)]" : "text-amber-700"}`}
                  >
                    {item.label}
                  </p>
                  {item.note && (
                    <p
                      className={`text-xs mt-0.5 ${item.complete ? "text-[var(--wk-text-tertiary)]" : "text-amber-600"}`}
                    >
                      {item.note}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Downgrade reasons */}
      {downgrades.length > 0 && (
        <div className="space-y-2">
          {downgrades.map((d) => (
            <div
              key={d.message}
              className="flex items-start gap-2 rounded-[var(--wk-radius-md)] bg-amber-50 px-3 py-2"
            >
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800">{d.message}</p>
            </div>
          ))}
        </div>
      )}

      {/* Upgrade prompt */}
      {autonomyLevel === "assisted" && (
        <p className="text-xs text-center text-[var(--wk-text-tertiary)]">
          Want full autonomy?{" "}
          <button
            type="button"
            className="text-[var(--wk-copilot)] hover:underline"
            onClick={() => onGoBack("gmail")}
          >
            Connect a Gmail account
          </button>
        </p>
      )}
      {autonomyLevel === "copilot_only" && (
        <p className="text-xs text-center text-[var(--wk-text-tertiary)]">
          Want more automation?{" "}
          <button
            type="button"
            className="text-[var(--wk-copilot)] hover:underline"
            onClick={() => onGoBack("credentials")}
          >
            Add platform logins
          </button>
        </p>
      )}

      <div className="space-y-3">
        <Button
          variant="cta"
          size="lg"
          className="w-full"
          onClick={onEnterWorkbench}
          disabled={isSubmitting}
        >
          {isSubmitting ? "Setting up..." : "Enter Workbench"}
        </Button>
        <button
          type="button"
          className="block mx-auto text-sm text-[var(--wk-text-tertiary)] hover:text-[var(--wk-text-secondary)] hover:underline"
          onClick={() => onGoBack("qa")}
        >
          Change something
        </button>
      </div>
    </div>
  );
}
