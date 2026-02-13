import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { Input } from "./input";

describe("Input", () => {
  it("renders an input element", () => {
    render(<Input aria-label="Email" />);
    expect(screen.getByRole("textbox", { name: "Email" })).toBeInTheDocument();
  });

  it("renders with the correct type", () => {
    render(<Input type="email" aria-label="Email" />);
    expect(screen.getByRole("textbox")).toHaveAttribute("type", "email");
  });

  it("renders with password type", () => {
    render(<Input type="password" data-testid="pw" />);
    expect(screen.getByTestId("pw")).toHaveAttribute("type", "password");
  });

  it("renders with a placeholder", () => {
    render(<Input placeholder="Enter your name" />);
    expect(screen.getByPlaceholderText("Enter your name")).toBeInTheDocument();
  });

  it("accepts user input", async () => {
    const user = userEvent.setup();
    render(<Input aria-label="Name" />);

    const input = screen.getByRole("textbox");
    await user.type(input, "Alice Johnson");
    expect(input).toHaveValue("Alice Johnson");
  });

  it("fires onChange handler", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Input aria-label="Name" onChange={onChange} />);

    await user.type(screen.getByRole("textbox"), "A");
    expect(onChange).toHaveBeenCalled();
  });

  it("applies the disabled attribute", () => {
    render(<Input disabled aria-label="Disabled" />);
    expect(screen.getByRole("textbox")).toBeDisabled();
  });

  it("does not accept input when disabled", async () => {
    const user = userEvent.setup();
    render(<Input disabled aria-label="Disabled" />);

    await user.type(screen.getByRole("textbox"), "test");
    expect(screen.getByRole("textbox")).toHaveValue("");
  });

  it("renders with a default value", () => {
    render(<Input defaultValue="Default text" aria-label="Default" />);
    expect(screen.getByRole("textbox")).toHaveValue("Default text");
  });

  it("supports controlled value", () => {
    const { rerender } = render(
      <Input value="initial" onChange={() => {}} aria-label="Controlled" />
    );
    expect(screen.getByRole("textbox")).toHaveValue("initial");

    rerender(
      <Input value="updated" onChange={() => {}} aria-label="Controlled" />
    );
    expect(screen.getByRole("textbox")).toHaveValue("updated");
  });

  it("merges custom className", () => {
    render(<Input className="custom-input" aria-label="Custom" />);
    expect(screen.getByRole("textbox").className).toContain("custom-input");
  });

  it("forwards ref", () => {
    const ref = vi.fn();
    render(<Input ref={ref} aria-label="Ref" />);
    expect(ref).toHaveBeenCalledWith(expect.any(HTMLInputElement));
  });

  it("passes through aria attributes", () => {
    render(
      <Input
        aria-label="Search"
        aria-describedby="help-text"
        aria-required="true"
      />
    );
    const input = screen.getByRole("textbox");
    expect(input).toHaveAttribute("aria-describedby", "help-text");
    expect(input).toHaveAttribute("aria-required", "true");
  });
});
