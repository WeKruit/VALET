import { useState, useEffect, useRef, useMemo } from "react";
import { CheckCircle, ArrowLeft } from "lucide-react";
import { Button } from "@valet/ui/components/button";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useConsent } from "@/features/consent/hooks/use-consent";
import { LoadingSpinner } from "@/components/common/loading-spinner";

// Step components
import { WelcomeStep } from "../components/welcome-step";
import { GmailStep } from "../components/gmail-step";
import { CredentialsStep } from "../components/credentials-step";
import { SecurityStep } from "../components/security-step";
import { ResumeUpload } from "../components/resume-upload";
import { QuickReview } from "../components/quick-review";
import { QaStep, type QaAnswers } from "../components/qa-step";
import { PreferencesStep, type JobPreferences } from "../components/preferences-step";
import { DisclaimerStep } from "../components/disclaimer-step";
import { ReadinessResultStep } from "../components/readiness-result-step";

import type { AutonomyLevel } from "@valet/shared/schemas";

// ─── Step definitions ───

type OnboardingStep =
  | "welcome"
  | "gmail"
  | "credentials"
  | "security"
  | "resume"
  | "profile"
  | "qa"
  | "preferences"
  | "consent"
  | "result";

const STEPS: Array<{
  key: OnboardingStep;
  label: string;
}> = [
  { key: "welcome", label: "How It Works" },
  { key: "gmail", label: "Email Setup" },
  { key: "credentials", label: "Platform Logins" },
  { key: "security", label: "Security" },
  { key: "resume", label: "Resume" },
  { key: "profile", label: "Profile" },
  { key: "qa", label: "Q&A" },
  { key: "preferences", label: "Preferences" },
  { key: "consent", label: "Consent" },
  { key: "result", label: "Ready" },
];

// ─── Visited flags (localStorage, user-scoped) ───

function visitedKey(userId: string) {
  return `valet:onboarding:visited:${userId}`;
}

function getVisited(userId: string): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(visitedKey(userId));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function markVisitedStep(userId: string, step: string) {
  const visited = getVisited(userId);
  visited[step] = true;
  localStorage.setItem(visitedKey(userId), JSON.stringify(visited));
}

// ─── Autonomy computation ───

interface ReadinessInputs {
  savedPlatforms: string[];
  mailboxConnected: boolean;
  mailboxTwoFactorEnabled: boolean;
}

/**
 * Autonomy is computed relative to what the user has actually configured,
 * not against a global list of all possible platforms.
 *
 * - full: mailbox connected (without blocking 2FA) AND at least one platform credential saved
 * - assisted: has credentials OR has mailbox, but not both fully ready
 * - copilot_only: nothing configured
 */
function computeAutonomyLevel(inputs: ReadinessInputs): AutonomyLevel {
  const { savedPlatforms, mailboxConnected, mailboxTwoFactorEnabled } = inputs;
  const hasAnyCreds = savedPlatforms.length > 0;

  if (mailboxConnected && !mailboxTwoFactorEnabled && hasAnyCreds) {
    return "full";
  }

  if (hasAnyCreds || mailboxConnected) {
    return "assisted";
  }

  return "copilot_only";
}

function computeDowngrades(
  inputs: ReadinessInputs,
): Array<{ from: AutonomyLevel; to: AutonomyLevel; message: string }> {
  const { savedPlatforms, mailboxConnected, mailboxTwoFactorEnabled } = inputs;
  const downgrades: Array<{
    from: AutonomyLevel;
    to: AutonomyLevel;
    message: string;
  }> = [];

  // No mailbox at all
  if (!mailboxConnected) {
    downgrades.push({
      from: "full",
      to: savedPlatforms.length > 0 ? "assisted" : "copilot_only",
      message:
        "Without a connected email, VALET can't read verification codes automatically. It will pause and notify you instead.",
    });
  }

  // Mailbox connected but 2FA blocks automatic access
  if (mailboxConnected && mailboxTwoFactorEnabled) {
    downgrades.push({
      from: "full",
      to: "assisted",
      message:
        "Your email has 2FA enabled, so VALET may not be able to retrieve verification codes automatically. Consider using an app password or a dedicated job-search Gmail.",
    });
  }

  // No credentials at all
  if (savedPlatforms.length === 0) {
    downgrades.push({
      from: "assisted",
      to: "copilot_only",
      message:
        "Without saved logins, VALET can't log in to platforms automatically. You'll need to log in manually each time.",
    });
  }

  return downgrades;
}

// ─── Main page ───

export function OnboardingPage() {
  const [step, setStep] = useState<OnboardingStep>("welcome");
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const { markCopilotAccepted, copilotAccepted } = useConsent();

  // ─── Local state for data collected during onboarding ───
  const [mailboxConnected, setMailboxConnected] = useState(false);
  const [mailboxTwoFactorEnabled, setMailboxTwoFactorEnabled] = useState(false);
  const [mailboxError, setMailboxError] = useState<string | null>(null);
  const [isConnectingMailbox, setIsConnectingMailbox] = useState(false);
  const [savedPlatforms, setSavedPlatforms] = useState<string[]>([]);
  const [savingPlatform, setSavingPlatform] = useState<string | null>(null);
  const [hasResume, setHasResume] = useState(false);
  const [profileComplete, setProfileComplete] = useState(false);
  const [preferencesComplete, setPreferencesComplete] = useState(false);

  // ─── Server state queries ───

  const resumesQuery = api.resumes.list.useQuery({
    queryKey: ["resumes", "onboarding"],
    queryData: {},
    staleTime: 1000 * 60 * 5,
  });

  const { data: profileData, isLoading: profileLoading } = api.users.getProfile.useQuery({
    queryKey: ["user-profile", "onboarding"],
    queryData: {},
  });

  const qaListQuery = api.qaBank.list.useQuery({
    queryKey: ["qa-bank", "onboarding"],
    queryData: { query: {} },
    staleTime: 1000 * 60 * 5,
  });

  const jobPrefsQuery = api.users.getJobPreferences.useQuery({
    queryKey: ["users", "jobPreferences", "onboarding"],
    queryData: {},
    staleTime: 1000 * 60 * 5,
  });

  const mailboxCredsQuery = api.credentials.listMailboxCredentials.useQuery({
    queryKey: ["mailbox-credentials", "onboarding"],
    queryData: {},
    staleTime: 1000 * 60 * 5,
  });

  const platformCredsQuery = api.credentials.listPlatformCredentials.useQuery({
    queryKey: ["platform-credentials", "onboarding"],
    queryData: {},
    staleTime: 1000 * 60 * 5,
  });

  const updateProfile = api.users.updateProfile.useMutation({
    onError: () => {
      toast.error("Failed to save profile. Please try again.");
    },
  });

  // Sync server state into local state
  useEffect(() => {
    if (resumesQuery.data?.status === 200) {
      setHasResume(resumesQuery.data.body.data.length > 0);
    }
  }, [resumesQuery.data]);

  useEffect(() => {
    if (profileData?.status === 200) {
      const p = profileData.body;
      const hasBasics = !!p.name && !!p.email && !!p.phone && !!p.location;
      setProfileComplete(hasBasics);
    }
  }, [profileData]);

  useEffect(() => {
    if (jobPrefsQuery.data?.status === 200) {
      const prefs = jobPrefsQuery.data.body;
      const hasPrefs =
        (prefs.targetJobTitles?.length ?? 0) > 0 || (prefs.preferredLocations?.length ?? 0) > 0;
      setPreferencesComplete(hasPrefs);
    }
  }, [jobPrefsQuery.data]);

  useEffect(() => {
    if (mailboxCredsQuery.data?.status === 200) {
      const activeMailboxes = mailboxCredsQuery.data.body.data.filter((m) => m.status === "active");
      setMailboxConnected(activeMailboxes.length > 0);
      setMailboxTwoFactorEnabled(activeMailboxes.some((m) => m.twoFactorEnabled));
    }
  }, [mailboxCredsQuery.data]);

  useEffect(() => {
    if (platformCredsQuery.data?.status === 200) {
      const activePlatforms = platformCredsQuery.data.body.data.filter(
        (p) => p.status === "active",
      );
      setSavedPlatforms(activePlatforms.map((p) => p.platform));
    }
  }, [platformCredsQuery.data]);

  // ─── Determine initial step (runs once after all queries load) ───

  const allQueriesLoaded =
    !profileLoading &&
    !resumesQuery.isLoading &&
    !qaListQuery.isLoading &&
    !jobPrefsQuery.isLoading &&
    !mailboxCredsQuery.isLoading &&
    !platformCredsQuery.isLoading;

  const stepRestored = useRef(false);

  useEffect(() => {
    if (!allQueriesLoaded || stepRestored.current) return;
    stepRestored.current = true;

    // Derive completion from server data (local state may not have synced yet)
    const serverHasResume =
      resumesQuery.data?.status === 200 && resumesQuery.data.body.data.length > 0;
    const serverProfileComplete =
      profileData?.status === 200 &&
      !!profileData.body.name &&
      !!profileData.body.email &&
      !!profileData.body.phone &&
      !!profileData.body.location;
    const qaEntries = qaListQuery.data?.status === 200 ? qaListQuery.data.body.data : [];
    const serverQaComplete =
      qaEntries.some((e) => e.question === "workAuthorization") &&
      qaEntries.some((e) => e.question === "visaSponsorship");
    const serverPrefsComplete =
      jobPrefsQuery.data?.status === 200 &&
      ((jobPrefsQuery.data.body.targetJobTitles?.length ?? 0) > 0 ||
        (jobPrefsQuery.data.body.preferredLocations?.length ?? 0) > 0);

    const visited = getVisited(userId);

    if (!visited["welcome"]) {
      setStep("welcome");
      return;
    }
    if (!visited["gmail"]) {
      setStep("gmail");
      return;
    }
    if (!visited["credentials"]) {
      setStep("credentials");
      return;
    }
    if (!visited["security"]) {
      setStep("security");
      return;
    }
    if (!serverHasResume) {
      setStep("resume");
      return;
    }
    if (!serverProfileComplete) {
      setStep("profile");
      return;
    }
    if (!serverQaComplete) {
      setStep("qa");
      return;
    }
    if (!serverPrefsComplete) {
      setStep("preferences");
      return;
    }
    if (!copilotAccepted) {
      setStep("consent");
      return;
    }
    setStep("result");
  }, [allQueriesLoaded]);

  // ─── Navigation helpers ───

  const currentStepIndex = STEPS.findIndex((s) => s.key === step);

  function goTo(target: OnboardingStep) {
    setStep(target);
  }

  function goBack() {
    if (currentStepIndex > 0) {
      const prev = STEPS[currentStepIndex - 1];
      if (prev) setStep(prev.key);
    }
  }

  // ─── Profile data for QuickReview ───

  const userProfile = profileData?.status === 200 ? profileData.body : null;
  const profile = useMemo(
    () => ({
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
    }),
    [userProfile],
  );

  // ─── Handlers ───

  const createMailbox = api.credentials.createMailboxCredential.useMutation();

  function handleGmailConnect(email: string, appPassword: string) {
    setIsConnectingMailbox(true);
    setMailboxError(null);

    // App password bypasses interactive 2FA for IMAP access,
    // so twoFactorEnabled=false means VALET can read codes without user intervention.
    const usesAppPassword = !!appPassword;
    createMailbox.mutate(
      {
        body: {
          provider: "gmail",
          emailAddress: email,
          secret: appPassword,
          accessMode: "imap_app_password",
          twoFactorEnabled: !usesAppPassword,
        },
      },
      {
        onSuccess: () => {
          setMailboxConnected(true);
          setMailboxTwoFactorEnabled(!usesAppPassword);
          setIsConnectingMailbox(false);
          markVisitedStep(userId, "gmail");
          goTo("credentials");
          toast.success("Gmail connected successfully.");
        },
        onError: (err) => {
          setIsConnectingMailbox(false);
          setMailboxError(
            err instanceof Error
              ? err.message
              : "Failed to connect Gmail. Check your app password and try again.",
          );
        },
      },
    );
  }

  function handleGmailSkip() {
    markVisitedStep(userId, "gmail");
    goTo("credentials");
  }

  const createPlatformCred = api.credentials.createPlatformCredential.useMutation();

  function handleSavePlatform(credential: {
    platform: string;
    username: string;
    password: string;
  }) {
    setSavingPlatform(credential.platform);

    createPlatformCred.mutate(
      {
        body: {
          platform: credential.platform,
          loginIdentifier: credential.username,
          secret: credential.password,
        },
      },
      {
        onSuccess: () => {
          setSavedPlatforms((prev) => [...prev, credential.platform]);
          setSavingPlatform(null);
          toast.success(`${credential.platform} credentials saved.`);
        },
        onError: () => {
          setSavingPlatform(null);
          toast.error(`Failed to save ${credential.platform} credentials.`);
        },
      },
    );
  }

  function handleCredentialsContinue() {
    markVisitedStep(userId, "credentials");
    goTo("security");
  }

  function handleSecurityContinue() {
    markVisitedStep(userId, "security");
    goTo("resume");
  }

  function handleResumeComplete(_file: File, _resumeId: string) {
    setHasResume(true);
    goTo("profile");
  }

  function handleProfileConfirm(updates: {
    phone: string;
    location: string;
    experience: string[];
    education: string;
  }) {
    const body: Record<string, unknown> = {};
    if (updates.phone) body.phone = updates.phone;
    if (updates.location) body.location = updates.location;
    if (updates.experience?.length) {
      body.workHistory = updates.experience.map((exp) => ({
        company: "",
        title: exp,
        startDate: "",
        endDate: "",
        description: "",
      }));
    }
    if (updates.education) {
      body.education = [
        {
          school: updates.education,
          degree: "",
          field: "",
          startDate: "",
          endDate: "",
          gpa: "",
        },
      ];
    }

    if (Object.keys(body).length > 0) {
      updateProfile.mutate(
        { body: body as any },
        {
          onSuccess: () => {
            setProfileComplete(true);
            goTo("qa");
          },
        },
      );
    } else {
      setProfileComplete(true);
      goTo("qa");
    }
  }

  const createQaEntry = api.qaBank.create.useMutation();

  const [qaSaving, setQaSaving] = useState(false);
  const REQUIRED_QA_KEYS = new Set(["workAuthorization", "visaSponsorship"]);

  function handleQaContinue(answers: QaAnswers) {
    const entries = Object.entries(answers).filter(([, v]) => v.trim() !== "");
    if (entries.length === 0) {
      goTo("preferences");
      return;
    }

    setQaSaving(true);
    let succeeded = 0;
    let failed = 0;
    let requiredFailed = 0;
    const total = entries.length;

    function checkDone() {
      if (succeeded + failed !== total) return;
      setQaSaving(false);
      if (requiredFailed > 0) {
        toast.error("Required answers failed to save. Please try again.");
        // Stay on Q&A so user can retry
      } else if (failed > 0) {
        toast.error(`${failed} of ${total} answers failed to save.`);
        goTo("preferences");
      } else {
        goTo("preferences");
      }
    }

    for (const [question, answer] of entries) {
      createQaEntry.mutate(
        {
          body: {
            question,
            answer,
            category: "custom",
            usageMode: "always_use",
          },
        },
        {
          onSuccess: () => {
            succeeded++;
            checkDone();
          },
          onError: () => {
            failed++;
            if (REQUIRED_QA_KEYS.has(question)) requiredFailed++;
            checkDone();
          },
        },
      );
    }
  }

  const updateJobPrefs = api.users.updateJobPreferences.useMutation();

  function handlePreferencesContinue(preferences: JobPreferences) {
    updateJobPrefs.mutate(
      {
        body: {
          targetJobTitles: preferences.targetTitles,
          preferredLocations: preferences.targetLocations,
          excludedCompanies: preferences.companyExclusions,
          remotePreference: (preferences.remotePreference || "any") as
            | "remote"
            | "hybrid"
            | "onsite"
            | "any",
        },
      },
      {
        onSuccess: () => {
          setPreferencesComplete(true);
          goTo("consent");
        },
        onError: () => {
          toast.error("Failed to save preferences. Please try again.");
        },
      },
    );
  }

  function handleConsentAccepted() {
    markCopilotAccepted();
    goTo("result");
  }

  const readinessInputs: ReadinessInputs = {
    savedPlatforms,
    mailboxConnected,
    mailboxTwoFactorEnabled,
  };

  const completeOnboarding = api.users.completeOnboarding.useMutation();
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleEnterWorkbench() {
    setIsSubmitting(true);
    completeOnboarding.mutate(
      { body: {} },
      {
        onSuccess: () => {
          // Also set localStorage as a fast-path for the auth-guard on this device
          localStorage.setItem(`valet:onboarding:completed:${userId}`, "true");
          window.location.replace("/apply");
        },
        onError: () => {
          setIsSubmitting(false);
          toast.error("Failed to complete onboarding. Please try again.");
        },
      },
    );
  }

  // ─── Loading state ───

  if (!allQueriesLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--wk-surface-page)]">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  // ─── Render ───

  return (
    <div className="min-h-screen bg-[var(--wk-surface-page)]">
      {/* Header */}
      <div className="flex items-center justify-center py-6 border-b border-[var(--wk-border-subtle)]">
        <div className="flex h-8 w-8 items-center justify-center rounded-[var(--wk-radius-lg)] bg-[var(--wk-text-primary)]">
          <span className="text-sm font-bold text-[var(--wk-surface-page)]">V</span>
        </div>
        <span className="ml-2 font-display text-lg font-semibold">WeKruit</span>
      </div>

      {/* Progress bar */}
      <div className="flex items-center justify-center gap-1 py-4 sm:py-6 px-4 overflow-x-auto">
        {STEPS.map((s, i) => (
          <div key={s.key} className="flex items-center gap-1">
            <div
              className={`flex h-6 w-6 sm:h-7 sm:w-7 items-center justify-center rounded-full transition-colors shrink-0 ${
                i < currentStepIndex
                  ? "bg-[var(--wk-status-success)] text-white"
                  : i === currentStepIndex
                    ? "bg-[var(--wk-copilot)] text-white"
                    : "bg-[var(--wk-border-default)] text-[var(--wk-text-tertiary)]"
              }`}
            >
              {i < currentStepIndex ? (
                <CheckCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              ) : (
                <span className="text-[10px] sm:text-xs font-medium">{i + 1}</span>
              )}
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={`h-px w-3 sm:w-5 transition-colors shrink-0 ${
                  i < currentStepIndex
                    ? "bg-[var(--wk-status-success)]"
                    : "bg-[var(--wk-border-default)]"
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step labels (hidden on mobile for space) */}
      <div className="hidden sm:flex justify-center gap-2 text-[10px] text-[var(--wk-text-secondary)] mb-6 px-4">
        {STEPS.map((s, i) => (
          <span
            key={s.key}
            className={`w-16 text-center ${
              i === currentStepIndex ? "font-medium text-[var(--wk-text-primary)]" : ""
            }`}
          >
            {s.label}
          </span>
        ))}
      </div>

      {/* Back button (steps 2+, not on result) */}
      {currentStepIndex > 0 && step !== "result" && (
        <div className="px-4 max-w-lg mx-auto mb-4">
          <Button variant="ghost" size="sm" onClick={goBack}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
        </div>
      )}

      {/* Step content */}
      <div className="px-4 pb-12">
        {step === "welcome" && (
          <WelcomeStep
            onContinue={() => {
              markVisitedStep(userId, "welcome");
              goTo("gmail");
            }}
          />
        )}

        {step === "gmail" && (
          <GmailStep
            onConnect={handleGmailConnect}
            onSkip={handleGmailSkip}
            isConnecting={isConnectingMailbox}
            connectionError={mailboxError}
            alreadyConnected={mailboxConnected}
          />
        )}

        {step === "credentials" && (
          <CredentialsStep
            onContinue={handleCredentialsContinue}
            onSavePlatform={handleSavePlatform}
            savedPlatforms={savedPlatforms}
            isSaving={!!savingPlatform}
            savingPlatform={savingPlatform}
            mailboxConnected={mailboxConnected}
          />
        )}

        {step === "security" && <SecurityStep onContinue={handleSecurityContinue} />}

        {step === "resume" && <ResumeUpload onUploadComplete={handleResumeComplete} />}

        {step === "profile" && (
          <QuickReview
            profile={profile}
            isSaving={updateProfile.isPending}
            onConfirm={handleProfileConfirm}
          />
        )}

        {step === "qa" && <QaStep onContinue={handleQaContinue} isSaving={qaSaving} />}

        {step === "preferences" && <PreferencesStep onContinue={handlePreferencesContinue} />}

        {step === "consent" && <DisclaimerStep onAccepted={handleConsentAccepted} />}

        {step === "result" && (
          <ReadinessResultStep
            autonomyLevel={computeAutonomyLevel(readinessInputs)}
            checklist={{
              resumeUploaded: hasResume,
              profileComplete,
              mailboxConnected,
              credentialsSaved: savedPlatforms,
              preferencesSet: preferencesComplete,
              consentAccepted: !!copilotAccepted,
            }}
            downgrades={computeDowngrades(readinessInputs)}
            onEnterWorkbench={handleEnterWorkbench}
            onGoBack={goTo as (step: string) => void}
            isSubmitting={isSubmitting}
          />
        )}
      </div>
    </div>
  );
}
