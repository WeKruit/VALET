import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QaStep, type QaAnswers } from "./qa-step";

vi.mock("@/lib/utils", () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(" "),
}));

describe("QaStep", () => {
  let onContinue: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    onContinue = vi.fn();
  });

  it("renders heading and required fields", () => {
    render(<QaStep onContinue={onContinue} />);
    expect(screen.getByText("Answer these once, use them everywhere")).toBeInTheDocument();
    expect(screen.getByText("Are you authorized to work in this country?")).toBeInTheDocument();
    expect(
      screen.getByText("Will you now or in the future require visa sponsorship?"),
    ).toBeInTheDocument();
  });

  it("continue button is disabled until required fields are filled", () => {
    render(<QaStep onContinue={onContinue} />);
    const button = screen.getByRole("button", { name: /continue/i });
    expect(button).toBeDisabled();
  });

  it("continue button is disabled when isSaving is true", () => {
    render(
      <QaStep
        onContinue={onContinue}
        isSaving
        initialAnswers={{ workAuthorization: "yes", visaSponsorship: "no" }}
      />,
    );
    const button = screen.getByRole("button", { name: /saving/i });
    expect(button).toBeDisabled();
  });

  it("shows Saving label when isSaving", () => {
    render(
      <QaStep
        onContinue={onContinue}
        isSaving
        initialAnswers={{ workAuthorization: "yes", visaSponsorship: "no" }}
      />,
    );
    expect(screen.getByRole("button", { name: /saving/i })).toBeInTheDocument();
  });

  it("renders optional fields", () => {
    render(<QaStep onContinue={onContinue} />);
    expect(screen.getByText("Desired salary range")).toBeInTheDocument();
    expect(screen.getByText("Are you willing to relocate?")).toBeInTheDocument();
    expect(screen.getByText("LinkedIn profile URL")).toBeInTheDocument();
  });

  it("calls onContinue with answers when initialAnswers are provided and button clicked", async () => {
    const user = userEvent.setup();
    render(
      <QaStep
        onContinue={onContinue}
        initialAnswers={{ workAuthorization: "yes", visaSponsorship: "no" }}
      />,
    );

    const button = screen.getByRole("button", { name: /continue/i });
    expect(button).toBeEnabled();

    await user.click(button);

    expect(onContinue).toHaveBeenCalledTimes(1);
    const args = onContinue.mock.calls[0]![0] as QaAnswers;
    expect(args.workAuthorization).toBe("yes");
    expect(args.visaSponsorship).toBe("no");
  });
});
