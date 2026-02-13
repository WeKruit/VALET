import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle, Upload, FileSearch, Rocket } from "lucide-react";
import { ResumeUpload } from "../components/resume-upload";
import { QuickReview } from "../components/quick-review";
import { DisclaimerStep } from "../components/disclaimer-step";
import { api } from "@/lib/api-client";
import { useConsent } from "@/features/consent/hooks/use-consent";
import { LoadingSpinner } from "@/components/common/loading-spinner";

type OnboardingStep = "upload" | "review" | "disclaimer";

const STEPS = [
  { key: "upload" as const, label: "Upload Resume", icon: Upload },
  { key: "review" as const, label: "Review Details", icon: FileSearch },
  { key: "disclaimer" as const, label: "Get Started", icon: Rocket },
];

export function OnboardingPage() {
  const [step, setStep] = useState<OnboardingStep>("upload");
  const navigate = useNavigate();
  const { markCopilotAccepted } = useConsent();

  const {
    data: profileData,
    isLoading: profileLoading,
  } = api.users.getProfile.useQuery({
    queryKey: ["user-profile"],
    queryData: {},
    enabled: step === "review",
  });

  const userProfile = profileData?.status === 200 ? profileData.body : null;

  const profile = {
    name: userProfile?.name ?? "",
    email: userProfile?.email ?? "",
    phone: userProfile?.phone ?? "",
    location: userProfile?.location ?? "",
    experience: (userProfile?.workHistory ?? []).map(String),
    education:
      Array.isArray(userProfile?.education) && userProfile.education.length > 0
        ? String(userProfile.education[0])
        : "",
    skills: userProfile?.skills ?? [],
  };

  const currentStepIndex = STEPS.findIndex((s) => s.key === step);

  return (
    <div className="min-h-screen bg-[var(--wk-surface-page)]">
      {/* Header */}
      <div className="flex items-center justify-center py-6 border-b border-[var(--wk-border-subtle)]">
        <div className="flex h-8 w-8 items-center justify-center rounded-[var(--wk-radius-lg)] bg-[var(--wk-text-primary)]">
          <span className="text-sm font-bold text-[var(--wk-surface-page)]">
            V
          </span>
        </div>
        <span className="ml-2 font-display text-lg font-semibold">
          WeKruit
        </span>
      </div>

      {/* Progress indicator */}
      <div className="flex items-center justify-center gap-2 py-6">
        {STEPS.map((s, i) => (
          <div key={s.key} className="flex items-center gap-2">
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors ${
                i < currentStepIndex
                  ? "bg-[var(--wk-status-success)] text-white"
                  : i === currentStepIndex
                    ? "bg-[var(--wk-copilot)] text-white"
                    : "bg-[var(--wk-border-default)] text-[var(--wk-text-tertiary)]"
              }`}
            >
              {i < currentStepIndex ? (
                <CheckCircle className="h-4 w-4" />
              ) : (
                <span className="text-xs font-medium">{i + 1}</span>
              )}
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={`h-px w-8 transition-colors ${
                  i < currentStepIndex
                    ? "bg-[var(--wk-status-success)]"
                    : "bg-[var(--wk-border-default)]"
                }`}
              />
            )}
          </div>
        ))}
      </div>
      <div className="flex justify-center gap-8 text-xs text-[var(--wk-text-secondary)] mb-8">
        {STEPS.map((s, i) => (
          <span
            key={s.key}
            className={
              i === currentStepIndex
                ? "font-medium text-[var(--wk-text-primary)]"
                : ""
            }
          >
            {s.label}
          </span>
        ))}
      </div>

      {/* Step content */}
      <div className="px-4 pb-12">
        {step === "upload" && (
          <ResumeUpload
            onUploadComplete={() => {
              setStep("review");
            }}
          />
        )}

        {step === "review" && profileLoading && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <LoadingSpinner size="lg" />
            <p className="text-sm text-[var(--wk-text-secondary)]">
              Loading your profile...
            </p>
          </div>
        )}

        {step === "review" && !profileLoading && (
          <QuickReview
            profile={profile}
            onConfirm={() => setStep("disclaimer")}
          />
        )}

        {step === "disclaimer" && (
          <DisclaimerStep
            onAccepted={() => {
              markCopilotAccepted();
              navigate("/dashboard");
            }}
          />
        )}
      </div>
    </div>
  );
}
