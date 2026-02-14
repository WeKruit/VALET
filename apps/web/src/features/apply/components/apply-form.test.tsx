import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type * as ReactRouterDom from "react-router-dom";
import { MemoryRouter } from "react-router-dom";
import { ApplyForm } from "./apply-form";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof ReactRouterDom>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const mockMutate = vi.fn();
let mockIsPending = false;

vi.mock("@/lib/api-client", () => ({
  api: {
    tasks: {
      create: {
        useMutation: (opts?: any) => ({
          mutate: (...args: any[]) => {
            mockMutate(...args);
            if (opts?.onSuccess) {
              opts.onSuccess({ status: 201, body: { id: "task-123" } });
            }
          },
          isPending: mockIsPending,
        }),
      },
    },
    resumes: {
      list: {
        useQuery: () => ({
          data: {
            status: 200,
            body: {
              data: [
                {
                  id: "resume-1",
                  filename: "resume.pdf",
                  status: "parsed",
                  isDefault: true,
                },
              ],
            },
          },
          isLoading: false,
        }),
      },
    },
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

function renderApplyForm() {
  return render(
    <MemoryRouter>
      <ApplyForm />
    </MemoryRouter>
  );
}

describe("ApplyForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsPending = false;
  });

  it("renders the heading and description", () => {
    renderApplyForm();
    expect(
      screen.getByText("Ready to apply to your next job!")
    ).toBeInTheDocument();
    expect(
      screen.getByText(/paste a job url below/i)
    ).toBeInTheDocument();
  });

  it("renders the URL input with placeholder", () => {
    renderApplyForm();
    expect(
      screen.getByPlaceholderText("https://www.linkedin.com/jobs/view/...")
    ).toBeInTheDocument();
  });

  it("renders the Start Application button as disabled initially", () => {
    renderApplyForm();
    expect(
      screen.getByRole("button", { name: "Start Application" })
    ).toBeDisabled();
  });

  it("renders sample job links", () => {
    renderApplyForm();
    expect(screen.getByText("LinkedIn Easy Apply")).toBeInTheDocument();
    expect(screen.getByText("Greenhouse")).toBeInTheDocument();
    expect(screen.getByText("Lever")).toBeInTheDocument();
  });

  it("renders copilot mode indicator", () => {
    renderApplyForm();
    expect(screen.getByText("Copilot mode")).toBeInTheDocument();
  });

  // --- Platform Detection ---

  it("detects LinkedIn platform from URL", async () => {
    const user = userEvent.setup();
    renderApplyForm();

    await user.type(
      screen.getByPlaceholderText("https://www.linkedin.com/jobs/view/..."),
      "https://www.linkedin.com/jobs/view/12345"
    );

    expect(screen.getByText("LinkedIn")).toBeInTheDocument();
    expect(screen.getByText("Easy Apply detected")).toBeInTheDocument();
  });

  it("detects Greenhouse platform from URL", async () => {
    const user = userEvent.setup();
    renderApplyForm();

    await user.type(
      screen.getByPlaceholderText("https://www.linkedin.com/jobs/view/..."),
      "https://boards.greenhouse.io/company/jobs/12345"
    );

    // "Greenhouse" appears in both platform badge and sample links
    const badges = screen.getAllByText("Greenhouse");
    expect(badges.length).toBeGreaterThanOrEqual(2);
  });

  it("detects Lever platform from URL", async () => {
    const user = userEvent.setup();
    renderApplyForm();

    await user.type(
      screen.getByPlaceholderText("https://www.linkedin.com/jobs/view/..."),
      "https://jobs.lever.co/company/12345"
    );

    // "Lever" appears in both platform badge and sample links
    const badges = screen.getAllByText("Lever");
    expect(badges.length).toBeGreaterThanOrEqual(2);
  });

  // --- URL Validation ---

  it("keeps button disabled for invalid URL", async () => {
    const user = userEvent.setup();
    renderApplyForm();

    await user.type(
      screen.getByPlaceholderText("https://www.linkedin.com/jobs/view/..."),
      "not-a-url"
    );

    expect(
      screen.getByRole("button", { name: "Start Application" })
    ).toBeDisabled();
  });

  it("keeps button disabled for non-supported platform URL", async () => {
    const user = userEvent.setup();
    renderApplyForm();

    await user.type(
      screen.getByPlaceholderText("https://www.linkedin.com/jobs/view/..."),
      "https://www.indeed.com/job/12345"
    );

    expect(
      screen.getByRole("button", { name: "Start Application" })
    ).toBeDisabled();
  });

  it("enables button for valid supported URL", async () => {
    const user = userEvent.setup();
    renderApplyForm();

    await user.type(
      screen.getByPlaceholderText("https://www.linkedin.com/jobs/view/..."),
      "https://www.linkedin.com/jobs/view/12345"
    );

    expect(
      screen.getByRole("button", { name: "Start Application" })
    ).toBeEnabled();
  });

  // --- Submission ---

  it("calls create task mutation with correct payload on submit", async () => {
    const user = userEvent.setup();
    renderApplyForm();

    await user.type(
      screen.getByPlaceholderText("https://www.linkedin.com/jobs/view/..."),
      "https://www.linkedin.com/jobs/view/12345"
    );

    await user.click(
      screen.getByRole("button", { name: "Start Application" })
    );

    expect(mockMutate).toHaveBeenCalledWith({
      body: {
        jobUrl: "https://www.linkedin.com/jobs/view/12345",
        mode: "copilot",
        resumeId: "resume-1",
      },
    });
  });

  it("navigates to task detail on successful creation", async () => {
    const user = userEvent.setup();
    renderApplyForm();

    await user.type(
      screen.getByPlaceholderText("https://www.linkedin.com/jobs/view/..."),
      "https://www.linkedin.com/jobs/view/12345"
    );

    await user.click(
      screen.getByRole("button", { name: "Start Application" })
    );

    expect(mockNavigate).toHaveBeenCalledWith("/tasks/task-123");
  });

  // --- Sample Links ---

  it("fills input when clicking LinkedIn sample link", async () => {
    const user = userEvent.setup();
    renderApplyForm();

    await user.click(screen.getByText("LinkedIn Easy Apply"));

    const input = screen.getByPlaceholderText(
      "https://www.linkedin.com/jobs/view/..."
    ) as HTMLInputElement;
    expect(input.value).toBe("https://www.linkedin.com/jobs/view/12345");
  });

  it("fills input when clicking Greenhouse sample link", async () => {
    const user = userEvent.setup();
    renderApplyForm();

    await user.click(screen.getByText("Greenhouse"));

    const input = screen.getByPlaceholderText(
      "https://www.linkedin.com/jobs/view/..."
    ) as HTMLInputElement;
    expect(input.value).toBe(
      "https://boards.greenhouse.io/company/jobs/12345"
    );
  });
});
