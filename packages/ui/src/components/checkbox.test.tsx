import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { Checkbox } from "./checkbox";

describe("Checkbox", () => {
  it("renders a checkbox element", () => {
    render(<Checkbox aria-label="Accept terms" />);
    expect(screen.getByRole("checkbox", { name: "Accept terms" })).toBeInTheDocument();
  });

  it("is unchecked by default", () => {
    render(<Checkbox aria-label="Accept" />);
    expect(screen.getByRole("checkbox")).not.toBeChecked();
  });

  it("toggles on click", async () => {
    const user = userEvent.setup();
    render(<Checkbox aria-label="Accept" />);

    const cb = screen.getByRole("checkbox");
    await user.click(cb);
    expect(cb).toBeChecked();
  });

  it("fires onCheckedChange handler", async () => {
    const onCheckedChange = vi.fn();
    const user = userEvent.setup();
    render(<Checkbox aria-label="Accept" onCheckedChange={onCheckedChange} />);

    await user.click(screen.getByRole("checkbox"));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it("supports controlled checked state", () => {
    const { rerender } = render(
      <Checkbox checked={false} onCheckedChange={() => {}} aria-label="Accept" />
    );
    expect(screen.getByRole("checkbox")).not.toBeChecked();

    rerender(
      <Checkbox checked={true} onCheckedChange={() => {}} aria-label="Accept" />
    );
    expect(screen.getByRole("checkbox")).toBeChecked();
  });

  it("applies the disabled attribute", () => {
    render(<Checkbox disabled aria-label="Accept" />);
    expect(screen.getByRole("checkbox")).toBeDisabled();
  });

  it("does not toggle when disabled", async () => {
    const onCheckedChange = vi.fn();
    const user = userEvent.setup();
    render(
      <Checkbox disabled aria-label="Accept" onCheckedChange={onCheckedChange} />
    );

    await user.click(screen.getByRole("checkbox"));
    expect(onCheckedChange).not.toHaveBeenCalled();
  });

  it("merges custom className", () => {
    render(<Checkbox className="custom-checkbox" aria-label="Accept" />);
    expect(screen.getByRole("checkbox").className).toContain("custom-checkbox");
  });

  it("forwards ref", () => {
    const ref = vi.fn();
    render(<Checkbox ref={ref} aria-label="Accept" />);
    expect(ref).toHaveBeenCalledWith(expect.any(HTMLButtonElement));
  });
});
