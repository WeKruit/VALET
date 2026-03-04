import { Card, CardContent } from "@valet/ui/components/card";
import { Zap, Settings } from "lucide-react";

export type OnboardingMode = "quick_start" | "full_setup";

interface EntryStepProps {
  onSelect: (mode: OnboardingMode) => void;
}

export function EntryStep({ onSelect }: EntryStepProps) {
  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="text-center space-y-3">
        <h2 className="font-display text-xl font-semibold">VALET applies to jobs for you</h2>
        <p className="text-sm text-[var(--wk-text-secondary)] max-w-md mx-auto">
          Upload your resume and see what VALET can do. Full account setup takes about 5 minutes.
        </p>
      </div>

      <div className="space-y-3">
        <button
          type="button"
          className="w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wk-copilot)] rounded-[var(--wk-radius-2xl)]"
          onClick={() => onSelect("quick_start")}
        >
          <Card className="transition-shadow hover:shadow-md border-2 border-[var(--wk-copilot)]">
            <CardContent className="p-6 flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--wk-radius-lg)] bg-blue-50">
                <Zap className="h-5 w-5 text-[var(--wk-copilot)]" />
              </div>
              <div className="space-y-1 flex-1">
                <h3 className="font-display text-base font-semibold">Try It Now</h3>
                <p className="text-sm text-[var(--wk-text-secondary)]">
                  Upload your resume, see your parsed profile, and preview how VALET would fill a
                  real application. Takes about 1 minute.
                </p>
              </div>
            </CardContent>
          </Card>
        </button>

        <button
          type="button"
          className="w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wk-copilot)] rounded-[var(--wk-radius-2xl)]"
          onClick={() => onSelect("full_setup")}
        >
          <Card className="transition-shadow hover:shadow-md">
            <CardContent className="p-6 flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--wk-radius-lg)] bg-gray-100">
                <Settings className="h-5 w-5 text-[var(--wk-text-secondary)]" />
              </div>
              <div className="space-y-1 flex-1">
                <h3 className="font-display text-base font-semibold">Full Setup</h3>
                <p className="text-sm text-[var(--wk-text-secondary)]">
                  Set up your complete profile, connect email, save platform logins, and get VALET
                  ready for autonomous applications.
                </p>
              </div>
            </CardContent>
          </Card>
        </button>
      </div>

      <p className="text-center text-xs text-[var(--wk-text-tertiary)]">
        You can always switch to Full Setup later.
      </p>
    </div>
  );
}
