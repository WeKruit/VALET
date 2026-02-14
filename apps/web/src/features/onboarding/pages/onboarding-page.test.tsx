import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type * as ReactRouterDom from "react-router-dom";
import { MemoryRouter } from "react-router-dom";
import { OnboardingPage } from "./onboarding-page";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof ReactRouterDom>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock api client for resume upload + user profile
const mockUploadMutate = vi.fn();
const mockUpdateProfileMutate = vi.fn();

// Store the latest useMutation opts so onSuccess uses the latest closure
let latestUploadOpts: any = null;

vi.mock("@/lib/api-client", () => ({
  api: {
    resumes: {
      upload: {
        useMutation: (opts?: any) => {
          // Update the ref on each render so onSuccess has fresh closure
          latestUploadOpts = opts;
          return {
            mutate: (payload: any) => {
              mockUploadMutate(payload);
              // Fire onSuccess asynchronously using latest opts
              // so React can flush state and re-render with fresh closure
              setTimeout(() => {
                if (latestUploadOpts?.onSuccess) {
                  latestUploadOpts.onSuccess({ status: 202, body: { id: "resume-1", status: "parsing" } });
                }
              }, 0);
            },
            isPending: false,
          };
        },
      },
    },
    users: {
      getProfile: {
        useQuery: () => ({
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
        }),
      },
      updateProfile: {
        useMutation: (_opts?: any) => ({
          mutate: (payload: any, callOpts?: any) => {
            mockUpdateProfileMutate(payload);
            if (callOpts?.onSuccess) {
              callOpts.onSuccess({ status: 200, body: {} });
            }
          },
          isPending: false,
        }),
      },
    },
    consent: {
      check: {
        useQuery: () => ({
          data: { status: 200, body: { accepted: false } },
          isLoading: false,
        }),
      },
      create: {
        useMutation: (_opts?: any) => ({
          mutate: (_payload: any, callOpts?: any) => {
            if (callOpts?.onSuccess) {
              callOpts.onSuccess({ status: 201, body: {} });
            }
          },
          isPending: false,
        }),
      },
    },
  },
}));

// Mock cn utility
vi.mock("@/lib/utils", () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(" "),
}));

// Mock sonner
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock useConsent hook
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

// Mock consent text
vi.mock("@/content/legal/consent-text", () => ({
  LAYER_1_REGISTRATION: { type: "tos", version: "1.0", title: "Terms of Service", preamble: "", risks: [] },
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
    </MemoryRouter>
  );
}

describe("OnboardingPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- Header ---

  it("renders the WeKruit logo and name", () => {
    renderOnboardingPage();
    expect(screen.getByText("V")).toBeInTheDocument();
    expect(screen.getByText("WeKruit")).toBeInTheDocument();
  });

  // --- Progress Dots ---

  it("renders 3 progress step labels", () => {
    renderOnboardingPage();
    expect(screen.getByText("Upload Resume")).toBeInTheDocument();
    expect(screen.getByText("Review Details")).toBeInTheDocument();
    expect(screen.getByText("Get Started")).toBeInTheDocument();
  });

  // --- Step 1: Upload ---

  it("starts on the upload step", () => {
    renderOnboardingPage();
    expect(screen.getByText("Upload Your Resume")).toBeInTheDocument();
    expect(screen.getByText("This is all we need to get started.")).toBeInTheDocument();
  });

  it("renders drag-and-drop instructions", () => {
    renderOnboardingPage();
    expect(
      screen.getByText("Drag and drop your resume here")
    ).toBeInTheDocument();
    expect(screen.getByText("or click to browse")).toBeInTheDocument();
    expect(screen.getByText("PDF or DOCX, max 10MB")).toBeInTheDocument();
  });

  it("renders the speed promise text", () => {
    renderOnboardingPage();
    expect(
      screen.getByText(
        "You'll be applying to your first job in about 2 minutes."
      )
    ).toBeInTheDocument();
  });

  it("renders a hidden file input accepting pdf and docx", () => {
    renderOnboardingPage();
    const fileInput = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    expect(fileInput).toBeInTheDocument();
    expect(fileInput.accept).toBe(".pdf,.docx");
    expect(fileInput.className).toContain("hidden");
  });

  // --- Step Transition ---

  it("transitions to review step after file upload", async () => {
    const user = userEvent.setup();
    renderOnboardingPage();

    const fileInput = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;

    const file = new File(["resume content"], "resume.pdf", {
      type: "application/pdf",
    });

    await user.upload(fileInput, file);

    // After upload completes (async mock), should show review step content
    await waitFor(() => {
      expect(screen.getByText("Does this look right?")).toBeInTheDocument();
    });
  });

  // --- Step 2: Review ---

  it("shows review content after transitioning", async () => {
    const user = userEvent.setup();
    renderOnboardingPage();

    const fileInput = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;

    const file = new File(["resume content"], "resume.pdf", {
      type: "application/pdf",
    });

    await user.upload(fileInput, file);

    await waitFor(() => {
      expect(screen.getByText(/Looks Good/)).toBeInTheDocument();
    });
  });

  it("transitions to disclaimer step on confirm from review step", async () => {
    const user = userEvent.setup();
    renderOnboardingPage();

    // Upload file to get to review
    const fileInput = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    const file = new File(["resume content"], "resume.pdf", {
      type: "application/pdf",
    });
    await user.upload(fileInput, file);

    // Wait for review step to appear
    await waitFor(() => {
      expect(screen.getByText(/Looks Good/)).toBeInTheDocument();
    });

    // Click confirm on review step
    const confirmButton = screen.getByRole("button", {
      name: /Looks Good/,
    });
    await user.click(confirmButton);

    // Should show the disclaimer step
    expect(screen.getByText("Before We Begin")).toBeInTheDocument();
  });

  // --- File Validation ---

  it("does not transition for invalid file types", async () => {
    const user = userEvent.setup();
    renderOnboardingPage();

    const fileInput = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;

    const invalidFile = new File(["content"], "resume.txt", {
      type: "text/plain",
    });

    await user.upload(fileInput, invalidFile);

    // Should still be on upload step
    expect(screen.getByText("Upload Your Resume")).toBeInTheDocument();
  });
});
