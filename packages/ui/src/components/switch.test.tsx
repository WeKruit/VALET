import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { Switch } from "./switch";

describe("Switch", () => {
  it("renders a switch element", () => {
    render(<Switch aria-label="Toggle" />);
    expect(screen.getByRole("switch", { name: "Toggle" })).toBeInTheDocument();
  });

  it("is unchecked by default", () => {
    render(<Switch aria-label="Toggle" />);
    expect(screen.getByRole("switch")).not.toBeChecked();
  });

  it("toggles on click", async () => {
    const user = userEvent.setup();
    render(<Switch aria-label="Toggle" />);

    const sw = screen.getByRole("switch");
    await user.click(sw);
    expect(sw).toBeChecked();
  });

  it("fires onCheckedChange handler", async () => {
    const onCheckedChange = vi.fn();
    const user = userEvent.setup();
    render(<Switch aria-label="Toggle" onCheckedChange={onCheckedChange} />);

    await user.click(screen.getByRole("switch"));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it("supports controlled checked state", () => {
    const { rerender } = render(
      <Switch checked={false} onCheckedChange={() => {}} aria-label="Toggle" />
    );
    expect(screen.getByRole("switch")).not.toBeChecked();

    rerender(
      <Switch checked={true} onCheckedChange={() => {}} aria-label="Toggle" />
    );
    expect(screen.getByRole("switch")).toBeChecked();
  });

  it("applies the disabled attribute", () => {
    render(<Switch disabled aria-label="Toggle" />);
    expect(screen.getByRole("switch")).toBeDisabled();
  });

  it("does not toggle when disabled", async () => {
    const onCheckedChange = vi.fn();
    const user = userEvent.setup();
    render(
      <Switch disabled aria-label="Toggle" onCheckedChange={onCheckedChange} />
    );

    await user.click(screen.getByRole("switch"));
    expect(onCheckedChange).not.toHaveBeenCalled();
  });

  it("merges custom className", () => {
    render(<Switch className="custom-switch" aria-label="Toggle" />);
    expect(screen.getByRole("switch").className).toContain("custom-switch");
  });

  it("forwards ref", () => {
    const ref = vi.fn();
    render(<Switch ref={ref} aria-label="Toggle" />);
    expect(ref).toHaveBeenCalledWith(expect.any(HTMLButtonElement));
  });
});
