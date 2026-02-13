import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectGroup,
  SelectLabel,
} from "./select";

describe("Select", () => {
  function renderSelect(props: { onValueChange?: (val: string) => void; defaultValue?: string } = {}) {
    return render(
      <Select onValueChange={props.onValueChange} defaultValue={props.defaultValue}>
        <SelectTrigger aria-label="Platform">
          <SelectValue placeholder="Select a platform" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Platforms</SelectLabel>
            <SelectItem value="linkedin">LinkedIn</SelectItem>
            <SelectItem value="greenhouse">Greenhouse</SelectItem>
            <SelectItem value="lever">Lever</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    );
  }

  it("renders the trigger with placeholder", () => {
    renderSelect();
    expect(screen.getByRole("combobox", { name: "Platform" })).toBeInTheDocument();
    expect(screen.getByText("Select a platform")).toBeInTheDocument();
  });

  it.skip("opens the dropdown when trigger is clicked", async () => {
    const user = userEvent.setup();
    renderSelect();

    await user.click(screen.getByRole("combobox"));
    expect(screen.getByRole("option", { name: "LinkedIn" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Greenhouse" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Lever" })).toBeInTheDocument();
  });

  it.skip("displays group label in dropdown", async () => {
    const user = userEvent.setup();
    renderSelect();

    await user.click(screen.getByRole("combobox"));
    expect(screen.getByText("Platforms")).toBeInTheDocument();
  });

  it.skip("selects an option when clicked", async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    renderSelect({ onValueChange });

    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByRole("option", { name: "LinkedIn" }));

    expect(onValueChange).toHaveBeenCalledWith("linkedin");
  });

  it.skip("shows selected value in trigger", async () => {
    const user = userEvent.setup();
    renderSelect();

    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByRole("option", { name: "Greenhouse" }));

    expect(screen.getByRole("combobox")).toHaveTextContent("Greenhouse");
  });

  it("renders with a default value", () => {
    renderSelect({ defaultValue: "lever" });
    expect(screen.getByRole("combobox")).toHaveTextContent("Lever");
  });

  it("renders a disabled select", () => {
    render(
      <Select disabled>
        <SelectTrigger aria-label="Disabled">
          <SelectValue placeholder="Disabled" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="test">Test</SelectItem>
        </SelectContent>
      </Select>
    );

    expect(screen.getByRole("combobox")).toBeDisabled();
  });
});
