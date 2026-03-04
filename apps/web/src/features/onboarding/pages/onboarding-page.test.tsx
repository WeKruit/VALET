import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { OnboardingPage } from "./onboarding-page";

// ─── Hoisted stable data (prevents infinite re-renders from new-object-per-call) ───

const { stableQueries, mockMutateAsync, mockToast } = vi.hoisted(() => {
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
    mockMutateAsync: {
      fn: ((_payload: any) => new Promise(() => {})) as (payload: any) => Promise<any>,
    },
    mockToast: { success: vi.fn(), error: vi.fn() },
  };
});

// ─── Mock heavy runtime imports to prevent OOM ───

vi.mock("lucide-react", () => ({
  CheckCircle: (props: any) => <span data-testid="check-icon" {...props} />,
  ArrowLeft: (props: any) => <span data-testid="arrow-icon" {...props} />,
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

vi.mock("@valet/shared/schemas", () => ({
  autonomyLevelSchema: { enum: ["full", "assisted", "copilot_only"] },
}));

// ─── Mock all step sub-components (lightweight stubs) ───

vi.mock("../components/welcome-step", () => ({
  WelcomeStep: ({ onContinue }: any) => (
    <div data-testid="welcome-step">
      <button onClick={onContinue}>Let&apos;s Get Set Up</button>
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

vi.mock("../components/quick-review", () => ({
  QuickReview: ({ onConfirm }: any) => (
    <div data-testid="profile-step">
      <button
        onClick={() => onConfirm({ phone: "555", location: "NY", experience: [], education: "" })}
      >
        Confirm
      </button>
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
    },
    users: {
      getProfile: { useQuery: () => stableQueries.profileData },
      updateProfile: {
        useMutation: () => ({
          mutate: (_payload: any, callOpts?: any) => {
            if (callOpts?.onSuccess) callOpts.onSuccess({ status: 200, body: {} });
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
          mutateAsync: (payload: any) => mockMutateAsync.fn(payload),
          mutate: vi.fn(),
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

/** Navigate from welcome through profile to reach the Q&A step */
async function navigateToQaStep(user: ReturnType<typeof userEvent.setup>) {
  renderOnboardingPage();

  // welcome → gmail
  await user.click(screen.getByRole("button", { name: /get set up/i }));
  // gmail → credentials
  await user.click(screen.getByRole("button", { name: /skip/i }));
  // credentials → security
  await user.click(screen.getByRole("button", { name: /continue/i }));
  // security → resume
  await user.click(screen.getByRole("button", { name: /continue/i }));
  // resume → profile
  await user.click(screen.getByRole("button", { name: /upload/i }));
  // profile → qa
  await user.click(screen.getByRole("button", { name: /confirm/i }));

  expect(screen.getByTestId("qa-step")).toBeInTheDocument();
}

describe("OnboardingPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    // Default: promises that never resolve (for isSaving / double-click tests)
    mockMutateAsync.fn = () => new Promise(() => {});
  });

  // ─── Shell rendering ───

  it("renders the WeKruit header", () => {
    renderOnboardingPage();
    expect(screen.getByText("V")).toBeInTheDocument();
    expect(screen.getByText("WeKruit")).toBeInTheDocument();
  });

  it("renders all 10 step labels in the progress bar", () => {
    renderOnboardingPage();
    for (const label of [
      "Welcome",
      "Email",
      "Platforms",
      "Security",
      "Resume",
      "Profile",
      "Q&A",
      "Prefs",
      "Consent",
      "Ready",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  // ─── Step navigation ───

  it("starts on the welcome step for a new user", () => {
    renderOnboardingPage();
    expect(screen.getByTestId("welcome-step")).toBeInTheDocument();
  });

  it("does not show a back button on the welcome step", () => {
    renderOnboardingPage();
    expect(screen.queryByRole("button", { name: /back/i })).not.toBeInTheDocument();
  });

  it("advances from welcome to gmail step", async () => {
    const user = userEvent.setup();
    renderOnboardingPage();
    await user.click(screen.getByRole("button", { name: /get set up/i }));
    expect(screen.getByTestId("gmail-step")).toBeInTheDocument();
  });

  it("shows a back button after the welcome step", async () => {
    const user = userEvent.setup();
    renderOnboardingPage();
    await user.click(screen.getByRole("button", { name: /get set up/i }));
    expect(screen.getByRole("button", { name: /back/i })).toBeInTheDocument();
  });

  // ─── Q&A mutation behavior (uses mutateAsync + Promise.allSettled) ───

  it("passes isSaving=true to QaStep while mutations are in flight", async () => {
    const user = userEvent.setup();
    await navigateToQaStep(user);

    expect(screen.getByTestId("qa-saving").textContent).toBe("false");

    // Click continue — fires mutateAsync calls that never resolve
    await user.click(screen.getByRole("button", { name: /continue/i }));

    // Promises are pending → isSaving stays true
    expect(screen.getByTestId("qa-saving").textContent).toBe("true");
  });

  it("advances to preferences when all Q&A mutations succeed", async () => {
    const user = userEvent.setup();
    mockMutateAsync.fn = () => Promise.resolve({ status: 201, body: {} });
    await navigateToQaStep(user);

    await user.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => {
      expect(screen.getByTestId("preferences-step")).toBeInTheDocument();
    });
  });

  it("stays on Q&A when a required answer fails", async () => {
    const user = userEvent.setup();
    mockMutateAsync.fn = (payload: any) => {
      if (payload.body.question === "workAuthorization") {
        return Promise.reject(new Error("fail"));
      }
      return Promise.resolve({ status: 201, body: {} });
    };
    await navigateToQaStep(user);

    await user.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith(
        "Required answers failed to save. Please try again.",
      );
    });
    expect(screen.getByTestId("qa-step")).toBeInTheDocument();
  });

  it("advances to preferences when only optional answers fail", async () => {
    const user = userEvent.setup();
    mockMutateAsync.fn = (payload: any) => {
      if (payload.body.question === "referralSource") {
        return Promise.reject(new Error("fail"));
      }
      return Promise.resolve({ status: 201, body: {} });
    };
    await navigateToQaStep(user);

    await user.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => {
      expect(screen.getByTestId("preferences-step")).toBeInTheDocument();
    });
    expect(mockToast.error).toHaveBeenCalled();
  });

  it("disables the continue button during Q&A save to prevent double-click", async () => {
    const user = userEvent.setup();
    await navigateToQaStep(user);

    const continueBtn = screen.getByRole("button", { name: /continue/i });
    expect(continueBtn).toBeEnabled();

    await user.click(continueBtn);

    // Promises pending → button stays disabled
    expect(continueBtn).toBeDisabled();
  });
});
