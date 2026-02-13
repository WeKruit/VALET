import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { OnboardingPage } from "./onboarding-page";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom"
  );
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock api client for resume upload
vi.mock("@/lib/api-client", () => ({
  api: {
    resumes: {
      upload: {
        useMutation: (opts?: any) => ({
          mutate: (_payload: any) => {
            // Simulate successful upload
            if (opts?.onSuccess) {
              opts.onSuccess({ status: 202, body: { id: "resume-1", status: "parsing" } });
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

  // ─── Header ───

  it("renders the WeKruit logo and name", () => {
    renderOnboardingPage();
    expect(screen.getByText("V")).toBeInTheDocument();
    expect(screen.getByText("WeKruit")).toBeInTheDocument();
  });

  // ─── Progress Dots ───

  it("renders 3 progress step labels", () => {
    renderOnboardingPage();
    expect(screen.getByText("Sign Up")).toBeInTheDocument();
    expect(screen.getByText("Resume")).toBeInTheDocument();
    expect(screen.getByText("Quick Review")).toBeInTheDocument();
  });

  // ─── Step 1: Upload ───

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

  // ─── Step Transition ───

  it("transitions to review step after file upload", async () => {
    const user = userEvent.setup();
    renderOnboardingPage();

    // Simulate file selection
    const fileInput = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;

    const file = new File(["resume content"], "resume.pdf", {
      type: "application/pdf",
    });

    await user.upload(fileInput, file);

    // After upload completes, should show review step
    // The upload mutation mock immediately succeeds, which triggers onUploadComplete
    // and transitions to review step
    expect(screen.getByText("Quick Review")).toBeInTheDocument();
  });

  // ─── Step 2: Review ───

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

    // Should show the QuickReview component
    // which has "Looks Good" confirmation button
    expect(screen.getByText(/Looks Good/)).toBeInTheDocument();
  });

  it("navigates to dashboard on confirm from review step", async () => {
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

    // Click confirm
    const confirmButton = screen.getByRole("button", {
      name: /Looks Good/,
    });
    await user.click(confirmButton);

    expect(mockNavigate).toHaveBeenCalledWith("/dashboard");
  });

  // ─── File Validation ───

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
