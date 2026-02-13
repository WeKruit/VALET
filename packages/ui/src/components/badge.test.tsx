import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Badge } from "./badge";

describe("Badge", () => {
  it("renders with text content", () => {
    render(<Badge>Active</Badge>);
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("renders as a div element", () => {
    render(<Badge data-testid="badge">Label</Badge>);
    expect(screen.getByTestId("badge").tagName).toBe("DIV");
  });

  it("renders with default variant", () => {
    render(<Badge>Default</Badge>);
    const badge = screen.getByText("Default");
    expect(badge.className).toContain("bg-[var(--wk-surface-raised)]");
  });

  it("renders with secondary variant", () => {
    render(<Badge variant="secondary">Secondary</Badge>);
    const badge = screen.getByText("Secondary");
    expect(badge.className).toContain("bg-[var(--wk-surface-sunken)]");
  });

  it("renders with success variant", () => {
    render(<Badge variant="success">Completed</Badge>);
    const badge = screen.getByText("Completed");
    expect(badge.className).toContain("text-[var(--wk-status-success)]");
  });

  it("renders with warning variant", () => {
    render(<Badge variant="warning">Pending</Badge>);
    const badge = screen.getByText("Pending");
    expect(badge.className).toContain("text-[var(--wk-status-warning)]");
  });

  it("renders with error variant", () => {
    render(<Badge variant="error">Failed</Badge>);
    const badge = screen.getByText("Failed");
    expect(badge.className).toContain("text-[var(--wk-status-error)]");
  });

  it("renders with info variant", () => {
    render(<Badge variant="info">Info</Badge>);
    const badge = screen.getByText("Info");
    expect(badge.className).toContain("text-[var(--wk-status-info)]");
  });

  it("renders with copilot variant", () => {
    render(<Badge variant="copilot">Copilot</Badge>);
    const badge = screen.getByText("Copilot");
    expect(badge.className).toContain("text-[var(--wk-copilot)]");
  });

  it("renders with autopilot variant", () => {
    render(<Badge variant="autopilot">Autopilot</Badge>);
    const badge = screen.getByText("Autopilot");
    expect(badge.className).toContain("text-[var(--wk-autopilot)]");
  });

  it("merges custom className", () => {
    render(<Badge className="ml-2">Custom</Badge>);
    expect(screen.getByText("Custom").className).toContain("ml-2");
  });

  it("passes through HTML attributes", () => {
    render(<Badge data-testid="status-badge" role="status">Active</Badge>);
    expect(screen.getByTestId("status-badge")).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("applies pill shape (rounded-full)", () => {
    render(<Badge>Pill</Badge>);
    expect(screen.getByText("Pill").className).toContain("rounded-[var(--wk-radius-full)]");
  });
});
