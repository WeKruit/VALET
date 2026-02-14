import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { Textarea } from "./textarea";

describe("Textarea", () => {
  it("renders a textarea element", () => {
    render(<Textarea aria-label="Notes" />);
    expect(screen.getByRole("textbox", { name: "Notes" })).toBeInTheDocument();
  });

  it("renders with a placeholder", () => {
    render(<Textarea placeholder="Enter your notes" />);
    expect(screen.getByPlaceholderText("Enter your notes")).toBeInTheDocument();
  });

  it("accepts user input", async () => {
    const user = userEvent.setup();
    render(<Textarea aria-label="Notes" />);

    const textarea = screen.getByRole("textbox");
    await user.type(textarea, "Hello World");
    expect(textarea).toHaveValue("Hello World");
  });

  it("fires onChange handler", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Textarea aria-label="Notes" onChange={onChange} />);

    await user.type(screen.getByRole("textbox"), "A");
    expect(onChange).toHaveBeenCalled();
  });

  it("applies the disabled attribute", () => {
    render(<Textarea disabled aria-label="Disabled" />);
    expect(screen.getByRole("textbox")).toBeDisabled();
  });

  it("does not accept input when disabled", async () => {
    const user = userEvent.setup();
    render(<Textarea disabled aria-label="Disabled" />);

    await user.type(screen.getByRole("textbox"), "test");
    expect(screen.getByRole("textbox")).toHaveValue("");
  });

  it("renders with a default value", () => {
    render(<Textarea defaultValue="Default text" aria-label="Default" />);
    expect(screen.getByRole("textbox")).toHaveValue("Default text");
  });

  it("supports controlled value", () => {
    const { rerender } = render(
      <Textarea value="initial" onChange={() => {}} aria-label="Controlled" />
    );
    expect(screen.getByRole("textbox")).toHaveValue("initial");

    rerender(
      <Textarea value="updated" onChange={() => {}} aria-label="Controlled" />
    );
    expect(screen.getByRole("textbox")).toHaveValue("updated");
  });

  it("merges custom className", () => {
    render(<Textarea className="custom-textarea" aria-label="Custom" />);
    expect(screen.getByRole("textbox").className).toContain("custom-textarea");
  });

  it("forwards ref", () => {
    const ref = vi.fn();
    render(<Textarea ref={ref} aria-label="Ref" />);
    expect(ref).toHaveBeenCalledWith(expect.any(HTMLTextAreaElement));
  });

  it("renders with rows attribute", () => {
    render(<Textarea rows={5} aria-label="Rows" />);
    expect(screen.getByRole("textbox")).toHaveAttribute("rows", "5");
  });

  it("passes through aria attributes", () => {
    render(
      <Textarea
        aria-label="Description"
        aria-describedby="help-text"
        aria-required="true"
      />
    );
    const textarea = screen.getByRole("textbox");
    expect(textarea).toHaveAttribute("aria-describedby", "help-text");
    expect(textarea).toHaveAttribute("aria-required", "true");
  });
});
