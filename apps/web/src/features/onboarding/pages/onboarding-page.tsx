import { useState, useEffect, useRef, useCallback } from "react";
import { CheckCircle, ArrowLeft } from "lucide-react";
import { Button } from "@valet/ui/components/button";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useConsent } from "@/features/consent/hooks/use-consent";
import { LoadingSpinner } from "@/components/common/loading-spinner";

// Step components
import { EntryStep, type OnboardingMode } from "../components/entry-step";
import { ResumeUpload } from "../components/resume-upload";
import { ParseFeedback } from "../components/parse-feedback";
import { QuickReview } from "../components/quick-review";
import { JobPreviewStep } from "../components/job-preview-step";
import { GmailStep } from "../components/gmail-step";
import { CredentialsStep } from "../components/credentials-step";
import { SecurityStep } from "../components/security-step";
import { QaStep, type QaAnswers } from "../components/qa-step";
import { PreferencesStep, type JobPreferences } from "../components/preferences-step";
import { DisclaimerStep } from "../components/disclaimer-step";
import { ReadinessResultStep } from "../components/readiness-result-step";

import { useResumeParse, type ParsedResumeData } from "../hooks/use-resume-parse";
import type { ProfileConfirmPayload } from "../components/quick-review";
import type { AutonomyLevel } from "@valet/shared/schemas";

// ─── Step definitions ───

type OnboardingStep =
  | "entry"
  | "resume"
  | "parse-feedback"
  | "parse-review"
  | "job-preview"
  | "qa"
  | "gmail"
  | "credentials"
  | "security"
  | "preferences"
  | "consent"
  | "result";

interface StepDef {
  key: OnboardingStep;
  label: string;
}

const QUICK_START_STEPS: StepDef[] = [
  { key: "entry", label: "Start" },
  { key: "resume", label: "Resume" },
  { key: "parse-feedback", label: "Analyzing" },
  { key: "parse-review", label: "Review" },
  { key: "job-preview", label: "Preview" },
];

const FULL_SETUP_STEPS: StepDef[] = [
  { key: "entry", label: "Start" },
  { key: "resume", label: "Resume" },
  { key: "parse-feedback", label: "Analyzing" },
  { key: "parse-review", label: "Review" },
  { key: "qa", label: "Q&A" },
  { key: "gmail", label: "Email" },
  { key: "credentials", label: "Logins" },
  { key: "security", label: "Security" },
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

function getModeKey(userId: string) {
  return `valet:onboarding:mode:${userId}`;
}

function getSavedMode(userId: string): OnboardingMode | null {
  try {
    const raw = localStorage.getItem(getModeKey(userId));
    if (raw === "quick_start" || raw === "full_setup") return raw;
    return null;
  } catch {
    return null;
  }
}

function saveMode(userId: string, mode: OnboardingMode) {
  localStorage.setItem(getModeKey(userId), mode);
}

// ─── Autonomy computation ───

interface ReadinessInputs {
  savedPlatforms: string[];
  mailboxConnected: boolean;
  mailboxTwoFactorEnabled: boolean;
}

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

  if (!mailboxConnected) {
    downgrades.push({
      from: "full",
      to: savedPlatforms.length > 0 ? "assisted" : "copilot_only",
      message:
        "Without a connected email, VALET can't read verification codes automatically. It will pause and notify you instead.",
    });
  }

  if (mailboxConnected && mailboxTwoFactorEnabled) {
    downgrades.push({
      from: "full",
      to: "assisted",
      message:
        "Your email has 2FA enabled, so VALET may not be able to retrieve verification codes automatically. Consider using an app password or a dedicated job-search Gmail.",
    });
  }

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
  const [step, setStep] = useState<OnboardingStep>("entry");
  const [mode, setMode] = useState<OnboardingMode>("quick_start");
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const { markCopilotAccepted, copilotAccepted } = useConsent();

  // ─── Resume parsing state ───
  const [resumeId, setResumeId] = useState<string | null>(null);
  const [uploadedFilename, setUploadedFilename] = useState<string | null>(null);
  const [parsedDataState, setParsedDataState] = useState<ParsedResumeData | null>(null);
  const [parseConfidence, setParseConfidence] = useState<number | null>(null);

  // WebSocket + polling hook for parse progress
  const { parsedData: hookParsedData, parseStatus, error: parseError } = useResumeParse(resumeId);

  // Sync hook output into local state
  useEffect(() => {
    if (hookParsedData) {
      setParsedDataState(hookParsedData);
    }
  }, [hookParsedData]);

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
      const resumes = resumesQuery.data.body.data;
      setHasResume(resumes.length > 0);

      // If a resume is already parsed, restore its data
      const parsed = resumes.find((r) => r.status === "parsed" && r.parsedData);
      if (parsed && !parsedDataState) {
        setParsedDataState(parsed.parsedData as ParsedResumeData);
        setResumeId(parsed.id);
        setParseConfidence(parsed.parsingConfidence ?? null);
      }
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

    // Restore saved mode
    const savedModeValue = getSavedMode(userId);
    if (savedModeValue) {
      setMode(savedModeValue);
    }

    // Derive completion from server data
    const serverHasResume =
      resumesQuery.data?.status === 200 && resumesQuery.data.body.data.length > 0;
    const serverHasParsedResume =
      resumesQuery.data?.status === 200 &&
      resumesQuery.data.body.data.some((r) => r.status === "parsed" && r.parsedData);
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
    const effectiveMode = savedModeValue ?? "quick_start";

    // Resume into the right step based on what's already done
    if (!visited["entry"]) {
      setStep("entry");
      return;
    }

    if (!serverHasResume) {
      setStep("resume");
      return;
    }

    if (!serverHasParsedResume) {
      // Resume exists but not parsed — restore resumeId so useResumeParse can listen/poll
      const unparsedResume =
        resumesQuery.data?.status === 200
          ? resumesQuery.data.body.data.find(
              (r) => r.status === "parsing" || r.status === "uploading",
            )
          : undefined;
      if (unparsedResume) {
        setResumeId(unparsedResume.id);
        setUploadedFilename(unparsedResume.filename ?? "Resume");
      }
      setStep("parse-feedback");
      return;
    }

    if (!serverProfileComplete && !visited["parse-review"]) {
      setStep("parse-review");
      return;
    }

    // Quick Start users who haven't seen preview
    if (effectiveMode === "quick_start" && !visited["job-preview"]) {
      setStep("job-preview");
      return;
    }

    // Full Setup steps
    if (effectiveMode === "full_setup" || visited["job-preview"]) {
      // If coming from Quick Start bridge, switch to full setup
      if (effectiveMode === "quick_start" && visited["job-preview"]) {
        setMode("full_setup");
        saveMode(userId, "full_setup");
      }

      if (!serverQaComplete) {
        setStep("qa");
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
      if (!serverPrefsComplete) {
        setStep("preferences");
        return;
      }
      if (!copilotAccepted) {
        setStep("consent");
        return;
      }
      setStep("result");
    }
  }, [allQueriesLoaded]);

  // ─── Active steps for progress bar ───

  const activeSteps = mode === "quick_start" ? QUICK_START_STEPS : FULL_SETUP_STEPS;
  const currentStepIndex = activeSteps.findIndex((s) => s.key === step);

  // ─── Navigation helpers ───

  function goTo(target: OnboardingStep) {
    setStep(target);
  }

  function goBack() {
    if (currentStepIndex > 0) {
      const prev = activeSteps[currentStepIndex - 1];
      if (prev) setStep(prev.key);
    }
  }

  // ─── Handlers ───

  function handleEntrySelect(selectedMode: OnboardingMode) {
    setMode(selectedMode);
    saveMode(userId, selectedMode);
    markVisitedStep(userId, "entry");
    goTo("resume");
  }

  function handleResumeUploadComplete(file: File, newResumeId: string) {
    setResumeId(newResumeId);
    setUploadedFilename(file.name);
    setHasResume(true);
    goTo("parse-feedback");
  }

  function handleParseRetry() {
    // Reset parse state and go back to resume upload
    setResumeId(null);
    setUploadedFilename(null);
    setParsedDataState(null);
    goTo("resume");
  }

  const handleParseComplete = useCallback(() => {
    // Fetch confidence from the resume query if available
    if (resumeId && typeof resumesQuery.refetch === "function") {
      void resumesQuery.refetch().then((result) => {
        if (result.data?.status === 200) {
          const resume = result.data.body.data.find((r: any) => r.id === resumeId);
          if (resume) {
            setParseConfidence(resume.parsingConfidence ?? null);
          }
        }
      });
    }
    goTo("parse-review");
  }, [resumeId]);

  function handleProfileConfirm(updates: ProfileConfirmPayload) {
    // Build payload using only fields the updateProfile contract accepts
    const body: Record<string, unknown> = {};
    if (updates.phone) body.phone = updates.phone;
    if (updates.location) body.location = updates.location;
    if (updates.workHistory?.length) body.workHistory = updates.workHistory;
    if (updates.education?.length) body.education = updates.education;
    if (updates.skills?.length) body.skills = updates.skills;

    function advance() {
      markVisitedStep(userId, "parse-review");
      setProfileComplete(true);
      if (mode === "quick_start") {
        goTo("job-preview");
      } else {
        goTo("qa");
      }
    }

    if (Object.keys(body).length > 0) {
      updateProfile.mutate({ body: body as any }, { onSuccess: advance });
    } else {
      advance();
    }
  }

  function handleJobPreviewContinueToFullSetup() {
    markVisitedStep(userId, "job-preview");
    setMode("full_setup");
    saveMode(userId, "full_setup");
    goTo("qa");
  }

  const createMailbox = api.credentials.createMailboxCredential.useMutation();

  function handleGmailConnect(email: string, appPassword: string) {
    setIsConnectingMailbox(true);
    setMailboxError(null);

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
    goTo("preferences");
  }

  const createQaEntry = api.qaBank.create.useMutation();

  const [qaSaving, setQaSaving] = useState(false);
  const REQUIRED_QA_KEYS = new Set(["workAuthorization", "visaSponsorship"]);

  function handleQaContinue(answers: QaAnswers) {
    const entries = Object.entries(answers).filter(([, v]) => v.trim() !== "");
    if (entries.length === 0) {
      goTo("gmail");
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
      } else if (failed > 0) {
        toast.error(`${failed} of ${total} answers failed to save.`);
        goTo("gmail");
      } else {
        goTo("gmail");
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

  const showBackButton = currentStepIndex > 0 && step !== "result" && step !== "parse-feedback"; // Don't allow going back during parsing

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
      {step !== "entry" && (
        <>
          <div className="flex items-center justify-center gap-1 py-4 sm:py-6 px-4 overflow-x-auto">
            {activeSteps.map((s, i) => (
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
                {i < activeSteps.length - 1 && (
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
            {activeSteps.map((s, i) => (
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
        </>
      )}

      {/* Back button */}
      {showBackButton && (
        <div className="px-4 max-w-lg mx-auto mb-4">
          <Button variant="ghost" size="sm" onClick={goBack}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
        </div>
      )}

      {/* Step content */}
      <div className="px-4 pb-12">
        {step === "entry" && <EntryStep onSelect={handleEntrySelect} />}

        {step === "resume" && <ResumeUpload onUploadComplete={handleResumeUploadComplete} />}

        {step === "parse-feedback" && (
          <ParseFeedback
            filename={uploadedFilename ?? "Resume"}
            parseStatus={parseStatus}
            parsedData={hookParsedData}
            error={parseError}
            onRetry={handleParseRetry}
            onParseComplete={handleParseComplete}
          />
        )}

        {step === "parse-review" && (
          <QuickReview
            parsedData={parsedDataState}
            parseConfidence={parseConfidence}
            isSaving={updateProfile.isPending}
            onConfirm={handleProfileConfirm}
          />
        )}

        {step === "job-preview" && (
          <JobPreviewStep
            parsedData={
              parsedDataState ??
              ({
                fullName: profileData?.status === 200 ? profileData.body.name : null,
                email: profileData?.status === 200 ? profileData.body.email : null,
              } as ParsedResumeData)
            }
            onContinueToFullSetup={handleJobPreviewContinueToFullSetup}
          />
        )}

        {step === "qa" && <QaStep onContinue={handleQaContinue} isSaving={qaSaving} />}

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
