import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { OnboardingPage } from "./onboarding-page";

// ─── Hoisted stable data (prevents infinite re-renders from new-object-per-call) ───

const { stableQueries, qaCallbacks, profileUpdateCallbacks, mockToast, mockParseHook } = vi.hoisted(
  () => {
    const resumeList = { data: { status: 200, body: { data: [] } }, isLoading: false };
    const profileData = {
      data: {
        status: 200,
        body: {
          name: "Test User",
          email: "test@example.com",
          phone: "",
          location: "",
          workHistory: [],
          education: [],
          skills: [],
        },
      },
      isLoading: false,
    };
    const prefsData = {
      data: {
        status: 200,
        body: {
          targetJobTitles: [],
          preferredLocations: [],
          remotePreference: "any",
          excludedCompanies: [],
          preferredIndustries: [],
        },
      },
      isLoading: false,
    };
    const consentData = { data: { status: 200, body: { accepted: false } }, isLoading: false };
    const credList = { data: { status: 200, body: { data: [] } }, isLoading: false };
    const qaList = { data: { status: 200, body: { data: [] } }, isLoading: false };

    return {
      stableQueries: { resumeList, profileData, prefsData, consentData, credList, qaList },
      qaCallbacks: {
        current: [] as Array<{ onSuccess?: () => void; onError?: () => void; question: string }>,
      },
      profileUpdateCallbacks: {
        current: [] as Array<{ onSuccess?: () => void; onError?: () => void }>,
        /** When true, calls onSuccess immediately (default). When false, stores callbacks. */
        autoSucceed: true,
        /** Captures the most recent mutation payload for assertions */
        lastPayload: null as any,
      },
      mockToast: { success: vi.fn(), error: vi.fn() },
      mockParseHook: {
        parsedData: null as any,
        parseStatus: "idle" as string,
        error: null as string | null,
        /** Tracks the resumeId passed to the hook in the last render */
        lastResumeId: null as string | null,
      },
    };
  },
);

// ─── Mock heavy runtime imports to prevent OOM ───

vi.mock("lucide-react", () => ({
  CheckCircle: (props: any) => <span data-testid="check-icon" {...props} />,
  ArrowLeft: (props: any) => <span data-testid="arrow-icon" {...props} />,
  Zap: (props: any) => <span {...props} />,
  Settings: (props: any) => <span {...props} />,
  Check: (props: any) => <span {...props} />,
  FileText: (props: any) => <span {...props} />,
  AlertCircle: (props: any) => <span {...props} />,
  RotateCw: (props: any) => <span {...props} />,
  AlertTriangle: (props: any) => <span {...props} />,
  User: (props: any) => <span {...props} />,
  Mail: (props: any) => <span {...props} />,
  Phone: (props: any) => <span {...props} />,
  MapPin: (props: any) => <span {...props} />,
  Briefcase: (props: any) => <span {...props} />,
  GraduationCap: (props: any) => <span {...props} />,
  Wrench: (props: any) => <span {...props} />,
  ArrowRight: (props: any) => <span {...props} />,
}));

vi.mock("@/components/common/loading-spinner", () => ({
  LoadingSpinner: () => <div data-testid="loading-spinner" />,
}));

vi.mock("@valet/ui/components/button", () => ({
  Button: ({ children, disabled, onClick, ...rest }: any) => (
    <button disabled={disabled} onClick={onClick} {...rest}>
      {children}
    </button>
  ),
}));

vi.mock("@valet/ui/components/card", () => ({
  Card: ({ children, onClick, ...rest }: any) => (
    <div onClick={onClick} {...rest}>
      {children}
    </div>
  ),
  CardContent: ({ children, ...rest }: any) => <div {...rest}>{children}</div>,
}));

vi.mock("@valet/ui/components/skeleton", () => ({
  Skeleton: (props: any) => <div data-testid="skeleton" {...props} />,
}));

vi.mock("@valet/shared/schemas", () => ({
  autonomyLevelSchema: { enum: ["full", "assisted", "copilot_only"] },
}));

// ─── Mock the resume parse hook ───

vi.mock("../hooks/use-resume-parse", () => ({
  useResumeParse: (resumeId: string | null) => {
    mockParseHook.lastResumeId = resumeId;
    return mockParseHook;
  },
}));

// ─── Mock all step sub-components (lightweight stubs) ───

vi.mock("../components/entry-step", () => ({
  EntryStep: ({ onSelect }: any) => (
    <div data-testid="entry-step">
      <button onClick={() => onSelect("quick_start")}>Try It Now</button>
      <button onClick={() => onSelect("full_setup")}>Full Setup</button>
    </div>
  ),
}));

vi.mock("../components/gmail-step", () => ({
  GmailStep: ({ onSkip }: any) => (
    <div data-testid="gmail-step">
      <button onClick={onSkip}>Skip</button>
    </div>
  ),
}));

vi.mock("../components/credentials-step", () => ({
  CredentialsStep: ({ onContinue }: any) => (
    <div data-testid="credentials-step">
      <button onClick={onContinue}>Continue</button>
    </div>
  ),
}));

vi.mock("../components/security-step", () => ({
  SecurityStep: ({ onContinue }: any) => (
    <div data-testid="security-step">
      <button onClick={onContinue}>Continue</button>
    </div>
  ),
}));

vi.mock("../components/resume-upload", () => ({
  ResumeUpload: ({ onUploadComplete }: any) => (
    <div data-testid="resume-step">
      <button onClick={() => onUploadComplete(new File([], "r.pdf"), "resume-1")}>Upload</button>
    </div>
  ),
}));

vi.mock("../components/parse-feedback", () => ({
  ParseFeedback: ({ onParseComplete, onRetry, parseStatus }: any) => (
    <div data-testid="parse-feedback-step">
      <span data-testid="parse-status">{parseStatus}</span>
      <button onClick={onParseComplete}>Parse Complete</button>
      <button onClick={onRetry}>Retry</button>
    </div>
  ),
}));

vi.mock("../components/quick-review", () => ({
  QuickReview: ({ onConfirm }: any) => (
    <div data-testid="parse-review-step">
      <button
        onClick={() =>
          onConfirm({
            phone: "555",
            location: "NY",
            skills: [],
            workHistory: [],
            education: [],
          })
        }
      >
        Confirm
      </button>
      <button
        onClick={() =>
          onConfirm({
            phone: "",
            location: "",
            skills: [],
            workHistory: [],
            education: [],
          })
        }
      >
        Confirm Empty
      </button>
    </div>
  ),
}));

vi.mock("../components/job-preview-step", () => ({
  JobPreviewStep: ({ onContinueToFullSetup, onFinishQuickStart }: any) => (
    <div data-testid="job-preview-step">
      <button onClick={onFinishQuickStart}>Go to Dashboard</button>
      <button onClick={onContinueToFullSetup}>Continue to Full Setup</button>
    </div>
  ),
}));

vi.mock("../components/qa-step", () => ({
  QaStep: ({ onContinue, isSaving }: any) => (
    <div data-testid="qa-step">
      <span data-testid="qa-saving">{String(!!isSaving)}</span>
      <button
        disabled={isSaving}
        onClick={() =>
          onContinue({
            workAuthorization: "yes",
            visaSponsorship: "no",
            salaryMin: "",
            salaryMax: "",
            willingToRelocate: "",
            driversLicense: "",
            felonyConviction: "",
            linkedinUrl: "",
            portfolioUrl: "",
            referralSource: "Online job board",
            eeoRace: "decline",
            eeoGender: "decline",
            eeoVeteran: "decline",
            eeoDisability: "decline",
          })
        }
      >
        Continue
      </button>
    </div>
  ),
}));

vi.mock("../components/preferences-step", () => ({
  PreferencesStep: ({ onContinue }: any) => (
    <div data-testid="preferences-step">
      <button
        onClick={() =>
          onContinue({
            targetTitles: ["SWE"],
            targetLocations: ["Remote"],
            companyExclusions: [],
            remotePreference: "remote",
          })
        }
      >
        Continue
      </button>
    </div>
  ),
}));

vi.mock("../components/disclaimer-step", () => ({
  DisclaimerStep: ({ onAccepted }: any) => (
    <div data-testid="consent-step">
      <button onClick={onAccepted}>Accept</button>
    </div>
  ),
}));

vi.mock("../components/readiness-result-step", () => ({
  ReadinessResultStep: ({ onEnterWorkbench, autonomyLevel }: any) => (
    <div data-testid="result-step">
      <span data-testid="autonomy-level">{autonomyLevel}</span>
      <button onClick={onEnterWorkbench}>Enter Workbench</button>
    </div>
  ),
}));

// ─── Mock api client (stable refs from hoisted data) ───

vi.mock("@/lib/api-client", () => ({
  api: {
    resumes: {
      list: { useQuery: () => stableQueries.resumeList },
      upload: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      getById: {
        useQuery: () => ({
          data: null,
          isLoading: false,
          refetch: vi.fn().mockResolvedValue({ data: null }),
          enabled: false,
        }),
      },
    },
    users: {
      getProfile: { useQuery: () => stableQueries.profileData },
      updateProfile: {
        useMutation: () => ({
          mutate: (payload: any, callOpts?: any) => {
            profileUpdateCallbacks.lastPayload = payload;
            if (profileUpdateCallbacks.autoSucceed) {
              if (callOpts?.onSuccess) callOpts.onSuccess({ status: 200, body: {} });
            } else {
              profileUpdateCallbacks.current.push({
                onSuccess: callOpts?.onSuccess,
                onError: callOpts?.onError,
              });
            }
          },
          isPending: false,
        }),
      },
      getJobPreferences: { useQuery: () => stableQueries.prefsData },
      updateJobPreferences: {
        useMutation: () => ({
          mutate: (_payload: any, callOpts?: any) => {
            if (callOpts?.onSuccess) callOpts.onSuccess({ status: 200, body: {} });
          },
          isPending: false,
        }),
      },
      completeOnboarding: {
        useMutation: () => ({
          mutate: (_payload: any, callOpts?: any) => {
            if (callOpts?.onSuccess) callOpts.onSuccess({ status: 200, body: {} });
          },
          isPending: false,
        }),
      },
    },
    consent: {
      check: { useQuery: () => stableQueries.consentData },
      create: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
    credentials: {
      listMailboxCredentials: { useQuery: () => stableQueries.credList },
      listPlatformCredentials: { useQuery: () => stableQueries.credList },
      createMailboxCredential: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      createPlatformCredential: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
    qaBank: {
      list: { useQuery: () => stableQueries.qaList },
      create: {
        useMutation: () => ({
          mutate: (payload: any, callOpts?: any) => {
            qaCallbacks.current.push({
              question: payload.body.question,
              onSuccess: callOpts?.onSuccess,
              onError: callOpts?.onError,
            });
          },
          isPending: false,
        }),
      },
    },
  },
}));

vi.mock("@/features/auth/hooks/use-auth", () => ({
  useAuth: () => ({
    user: { id: "test-user-id", email: "test@example.com", name: "Test User", role: "developer" },
    isLoading: false,
    setUser: vi.fn(),
  }),
}));

vi.mock("@/lib/utils", () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(" "),
}));

vi.mock("sonner", () => ({ toast: mockToast }));

vi.mock("@/features/consent/hooks/use-consent", () => ({
  useConsent: () => ({
    tosAccepted: false,
    copilotAccepted: false,
    isLoading: false,
    needsConsent: true,
    needsTos: true,
    needsCopilot: false,
    markTosAccepted: vi.fn(),
    markCopilotAccepted: vi.fn(),
  }),
}));

vi.mock("@/content/legal/consent-text", () => ({
  LAYER_1_REGISTRATION: { type: "tos", version: "1.0", title: "Terms", preamble: "", risks: [] },
  LAYER_2_COPILOT_DISCLAIMER: {
    type: "copilot_disclaimer",
    version: "1.0",
    title: "Copilot Disclaimer",
    preamble: "Please review",
    risks: [],
  },
}));

function renderOnboardingPage() {
  return render(
    <MemoryRouter>
      <OnboardingPage />
    </MemoryRouter>,
  );
}

/** Navigate Quick Start: entry → resume → parse-feedback → parse-review → job-preview */
async function navigateToJobPreview(user: ReturnType<typeof userEvent.setup>) {
  renderOnboardingPage();

  // entry: select Quick Start
  await user.click(screen.getByRole("button", { name: /try it now/i }));
  // resume: upload
  await user.click(screen.getByRole("button", { name: /upload/i }));
  // parse-feedback: simulate parse complete
  await user.click(screen.getByRole("button", { name: /parse complete/i }));
  // parse-review: confirm
  await user.click(screen.getByRole("button", { name: /^confirm$/i }));

  expect(screen.getByTestId("job-preview-step")).toBeInTheDocument();
}

/** Navigate Full Setup to Q&A: entry → resume → parse-feedback → parse-review → qa */
async function navigateToQaStep(user: ReturnType<typeof userEvent.setup>) {
  renderOnboardingPage();

  // entry: select Full Setup
  await user.click(screen.getByRole("button", { name: /full setup/i }));
  // resume: upload
  await user.click(screen.getByRole("button", { name: /upload/i }));
  // parse-feedback: simulate parse complete
  await user.click(screen.getByRole("button", { name: /parse complete/i }));
  // parse-review: confirm
  await user.click(screen.getByRole("button", { name: /^confirm$/i }));

  expect(screen.getByTestId("qa-step")).toBeInTheDocument();
}

describe("OnboardingPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    qaCallbacks.current = [];
    profileUpdateCallbacks.current = [];
    profileUpdateCallbacks.autoSucceed = true;
    profileUpdateCallbacks.lastPayload = null;
    mockParseHook.parsedData = null;
    mockParseHook.parseStatus = "idle";
    mockParseHook.error = null;
    mockParseHook.lastResumeId = null;
    // Reset query data to defaults (some tests override these)
    stableQueries.resumeList.data = { status: 200, body: { data: [] } } as any;
    stableQueries.profileData.data = {
      status: 200,
      body: {
        name: "Test User",
        email: "test@example.com",
        phone: "",
        location: "",
        workHistory: [],
        education: [],
        skills: [],
      },
    } as any;
  });

  // ─── Shell rendering ───

  it("renders the WeKruit header", () => {
    renderOnboardingPage();
    expect(screen.getByText("V")).toBeInTheDocument();
    expect(screen.getByText("WeKruit")).toBeInTheDocument();
  });

  it("does not show progress bar on entry step", () => {
    renderOnboardingPage();
    // Entry step should not show step labels
    expect(screen.queryByText("Resume")).not.toBeInTheDocument();
  });

  // ─── Entry step and mode selection ───

  it("starts on the entry step for a new user", () => {
    renderOnboardingPage();
    expect(screen.getByTestId("entry-step")).toBeInTheDocument();
  });

  it("does not show a back button on the entry step", () => {
    renderOnboardingPage();
    expect(screen.queryByRole("button", { name: /back/i })).not.toBeInTheDocument();
  });

  it("advances to resume step when Quick Start is selected", async () => {
    const user = userEvent.setup();
    renderOnboardingPage();
    await user.click(screen.getByRole("button", { name: /try it now/i }));
    expect(screen.getByTestId("resume-step")).toBeInTheDocument();
  });

  it("advances to resume step when Full Setup is selected", async () => {
    const user = userEvent.setup();
    renderOnboardingPage();
    await user.click(screen.getByRole("button", { name: /full setup/i }));
    expect(screen.getByTestId("resume-step")).toBeInTheDocument();
  });

  // ─── Quick Start flow ───

  it("advances from resume upload to parse feedback", async () => {
    const user = userEvent.setup();
    renderOnboardingPage();
    await user.click(screen.getByRole("button", { name: /try it now/i }));
    await user.click(screen.getByRole("button", { name: /upload/i }));
    expect(screen.getByTestId("parse-feedback-step")).toBeInTheDocument();
  });

  it("advances from parse feedback to parse review", async () => {
    const user = userEvent.setup();
    renderOnboardingPage();
    await user.click(screen.getByRole("button", { name: /try it now/i }));
    await user.click(screen.getByRole("button", { name: /upload/i }));
    await user.click(screen.getByRole("button", { name: /parse complete/i }));
    expect(screen.getByTestId("parse-review-step")).toBeInTheDocument();
  });

  it("Quick Start shows job preview after parse review", async () => {
    const user = userEvent.setup();
    await navigateToJobPreview(user);
    expect(screen.getByTestId("job-preview-step")).toBeInTheDocument();
  });

  it("Quick Start bridges to Full Setup from job preview", async () => {
    const user = userEvent.setup();
    await navigateToJobPreview(user);
    await user.click(screen.getByRole("button", { name: /continue to full setup/i }));
    // Should advance to Q&A (first Full Setup step after shared steps)
    expect(screen.getByTestId("qa-step")).toBeInTheDocument();
  });

  // ─── Full Setup flow ───

  it("Full Setup goes to Q&A after parse review", async () => {
    const user = userEvent.setup();
    await navigateToQaStep(user);
    expect(screen.getByTestId("qa-step")).toBeInTheDocument();
  });

  // ─── Q&A mutation behavior ───

  it("passes isSaving=true to QaStep while mutations are in flight", async () => {
    const user = userEvent.setup();
    await navigateToQaStep(user);

    expect(screen.getByTestId("qa-saving").textContent).toBe("false");
    await user.click(screen.getByRole("button", { name: /continue/i }));
    expect(screen.getByTestId("qa-saving").textContent).toBe("true");
  });

  it("advances to gmail when all Q&A mutations succeed", async () => {
    const user = userEvent.setup();
    await navigateToQaStep(user);

    await user.click(screen.getByRole("button", { name: /continue/i }));

    act(() => {
      for (const cb of qaCallbacks.current) {
        cb.onSuccess?.();
      }
    });

    expect(screen.getByTestId("gmail-step")).toBeInTheDocument();
  });

  it("stays on Q&A when a required answer fails", async () => {
    const user = userEvent.setup();
    await navigateToQaStep(user);

    await user.click(screen.getByRole("button", { name: /continue/i }));

    act(() => {
      for (const cb of qaCallbacks.current) {
        if (cb.question === "workAuthorization") {
          cb.onError?.();
        } else {
          cb.onSuccess?.();
        }
      }
    });

    expect(screen.getByTestId("qa-step")).toBeInTheDocument();
    expect(mockToast.error).toHaveBeenCalledWith(
      "Required answers failed to save. Please try again.",
    );
  });

  it("advances to gmail when only optional answers fail", async () => {
    const user = userEvent.setup();
    await navigateToQaStep(user);

    await user.click(screen.getByRole("button", { name: /continue/i }));

    act(() => {
      for (const cb of qaCallbacks.current) {
        if (cb.question === "referralSource") {
          cb.onError?.();
        } else {
          cb.onSuccess?.();
        }
      }
    });

    expect(screen.getByTestId("gmail-step")).toBeInTheDocument();
    expect(mockToast.error).toHaveBeenCalled();
  });

  it("disables the continue button during Q&A save to prevent double-click", async () => {
    const user = userEvent.setup();
    await navigateToQaStep(user);

    const continueBtn = screen.getByRole("button", { name: /continue/i });
    expect(continueBtn).toBeEnabled();

    await user.click(continueBtn);
    expect(continueBtn).toBeDisabled();
  });

  // ─── Parse retry ───

  it("returns to resume upload on parse retry", async () => {
    const user = userEvent.setup();
    renderOnboardingPage();
    await user.click(screen.getByRole("button", { name: /try it now/i }));
    await user.click(screen.getByRole("button", { name: /upload/i }));
    expect(screen.getByTestId("parse-feedback-step")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /retry/i }));
    expect(screen.getByTestId("resume-step")).toBeInTheDocument();
  });

  // ─── Reload-while-parsing recovery (P1 fix) ───

  it("restores resumeId from server on reload when resume is still parsing", () => {
    // Simulate: user has visited entry, has a resume with status "parsing" on the server
    localStorage.setItem("valet:onboarding:visited:test-user-id", JSON.stringify({ entry: true }));
    localStorage.setItem("valet:onboarding:mode:test-user-id", "quick_start");

    // Override resume list to include an unparsed resume
    stableQueries.resumeList.data = {
      status: 200,
      body: {
        data: [
          {
            id: "resume-parsing-1",
            status: "parsing",
            parsedData: null,
            parsingConfidence: null,
            filename: "my-resume.pdf",
          },
        ],
      },
    } as any;

    renderOnboardingPage();

    // Should land on parse-feedback
    expect(screen.getByTestId("parse-feedback-step")).toBeInTheDocument();
    // The key assertion: useResumeParse was called with the server's resumeId,
    // NOT null. Without the fix, resumeId stays null and the hook stays idle.
    expect(mockParseHook.lastResumeId).toBe("resume-parsing-1");
  });

  // ─── Failed profile save does NOT mark parse-review visited (P1 fix) ───

  it("does not mark parse-review visited when profile save fails", async () => {
    // Disable auto-succeed so we can control when onSuccess/onError fires
    profileUpdateCallbacks.autoSucceed = false;

    const user = userEvent.setup();
    renderOnboardingPage();

    // Navigate to parse-review
    await user.click(screen.getByRole("button", { name: /try it now/i }));
    await user.click(screen.getByRole("button", { name: /upload/i }));
    await user.click(screen.getByRole("button", { name: /parse complete/i }));
    expect(screen.getByTestId("parse-review-step")).toBeInTheDocument();

    // Click confirm — mutation fires but does NOT auto-succeed
    await user.click(screen.getByRole("button", { name: /^confirm$/i }));

    // The mutation was called but hasn't resolved yet
    expect(profileUpdateCallbacks.current).toHaveLength(1);

    // Simulate failure — call onError instead of onSuccess
    act(() => {
      profileUpdateCallbacks.current[0]!.onError?.();
    });

    // parse-review should NOT be marked visited because onSuccess never fired
    const visited = JSON.parse(
      localStorage.getItem("valet:onboarding:visited:test-user-id") ?? "{}",
    );
    expect(visited["parse-review"]).toBeUndefined();
  });

  it("prefers in-flight resume over older parsed resume on reload", () => {
    // API returns newest-first: newer parsing resume is at index 0
    localStorage.setItem("valet:onboarding:visited:test-user-id", JSON.stringify({ entry: true }));
    localStorage.setItem("valet:onboarding:mode:test-user-id", "quick_start");

    stableQueries.resumeList.data = {
      status: 200,
      body: {
        data: [
          {
            id: "resume-new-parsing",
            status: "parsing",
            parsedData: null,
            parsingConfidence: null,
            filename: "new-resume.pdf",
          },
          {
            id: "resume-old-parsed",
            status: "parsed",
            parsedData: { fullName: "Old Data", email: "old@test.com" },
            parsingConfidence: 0.95,
            filename: "old-resume.pdf",
          },
        ],
      },
    } as any;

    renderOnboardingPage();

    // Should land on parse-feedback (not parse-review or job-preview)
    expect(screen.getByTestId("parse-feedback-step")).toBeInTheDocument();
    // Should be tracking the newest (in-flight) resume, not the old parsed one
    expect(mockParseHook.lastResumeId).toBe("resume-new-parsing");
  });

  it("surfaces failure when newest resume is parse_failed despite older parsed resume existing", () => {
    // API returns newest-first: failed resume at index 0, older parsed at index 1
    localStorage.setItem("valet:onboarding:visited:test-user-id", JSON.stringify({ entry: true }));
    localStorage.setItem("valet:onboarding:mode:test-user-id", "quick_start");

    stableQueries.resumeList.data = {
      status: 200,
      body: {
        data: [
          {
            id: "resume-failed",
            status: "parse_failed",
            parsedData: null,
            parsingConfidence: null,
            filename: "failed-resume.pdf",
          },
          {
            id: "resume-old-parsed",
            status: "parsed",
            parsedData: { fullName: "Old Data", email: "old@test.com" },
            parsingConfidence: 0.95,
            filename: "old-resume.pdf",
          },
        ],
      },
    } as any;

    renderOnboardingPage();

    // Should land on parse-feedback so the user sees the failure and can retry
    // — NOT silently restore the older parsed resume
    expect(screen.getByTestId("parse-feedback-step")).toBeInTheDocument();
    expect(mockParseHook.lastResumeId).toBe("resume-failed");
  });

  it("marks parse-review visited only after profile save succeeds", async () => {
    const user = userEvent.setup();
    renderOnboardingPage();

    // Navigate to parse-review
    await user.click(screen.getByRole("button", { name: /try it now/i }));
    await user.click(screen.getByRole("button", { name: /upload/i }));
    await user.click(screen.getByRole("button", { name: /parse complete/i }));

    // Confirm (default mock auto-succeeds)
    await user.click(screen.getByRole("button", { name: /^confirm$/i }));

    // After success, parse-review IS marked visited
    const visited = JSON.parse(
      localStorage.getItem("valet:onboarding:visited:test-user-id") ?? "{}",
    );
    expect(visited["parse-review"]).toBe(true);
  });

  // ─── Quick Start finish ───

  it("Quick Start finishes onboarding from job preview", async () => {
    const user = userEvent.setup();
    await navigateToJobPreview(user);

    // Click "Go to Dashboard"
    await user.click(screen.getByRole("button", { name: /go to dashboard/i }));

    // Should have called completeOnboarding (via redirect to /apply)
    // The mock auto-succeeds, so localStorage should be set
    expect(localStorage.getItem("valet:onboarding:completed:test-user-id")).toBe("true");
  });

  it("Quick Start reload after visiting job-preview stays on job-preview", () => {
    // Set up localStorage: quick_start mode, visited entry + parse-review + job-preview
    localStorage.setItem(
      "valet:onboarding:visited:test-user-id",
      JSON.stringify({ entry: true, "parse-review": true, "job-preview": true }),
    );
    localStorage.setItem("valet:onboarding:mode:test-user-id", "quick_start");

    // Set up server state: has parsed resume + complete profile
    stableQueries.resumeList.data = {
      status: 200,
      body: {
        data: [
          {
            id: "resume-parsed-1",
            status: "parsed",
            parsedData: { fullName: "Test User", email: "test@example.com" },
            parsingConfidence: 0.95,
            filename: "resume.pdf",
          },
        ],
      },
    } as any;

    // Profile is complete (name, email, phone, location all present)
    stableQueries.profileData.data = {
      status: 200,
      body: {
        name: "Test User",
        email: "test@example.com",
        phone: "555-1234",
        location: "New York",
        workHistory: [],
        education: [],
        skills: [],
      },
    } as any;

    renderOnboardingPage();

    // Should stay on job-preview, NOT advance to qa or full-setup steps
    expect(screen.getByTestId("job-preview-step")).toBeInTheDocument();
  });

  // ─── Clear-values regression (035fcd9) ───

  it("always includes all five profile fields in mutation body even when all values are cleared", async () => {
    const user = userEvent.setup();
    renderOnboardingPage();

    // Navigate to parse-review
    await user.click(screen.getByRole("button", { name: /try it now/i }));
    await user.click(screen.getByRole("button", { name: /upload/i }));
    await user.click(screen.getByRole("button", { name: /parse complete/i }));
    expect(screen.getByTestId("parse-review-step")).toBeInTheDocument();

    // Confirm with all-empty payload (phone="", location="", skills=[], workHistory=[], education=[])
    await user.click(screen.getByRole("button", { name: /confirm empty/i }));

    // The mutation must fire with all five fields present — empty strings/arrays must not be dropped
    expect(profileUpdateCallbacks.lastPayload).not.toBeNull();
    const body = profileUpdateCallbacks.lastPayload.body;
    expect(body).toHaveProperty("phone", "");
    expect(body).toHaveProperty("location", "");
    expect(body).toHaveProperty("skills", []);
    expect(body).toHaveProperty("workHistory", []);
    expect(body).toHaveProperty("education", []);
  });
});
