import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeAll } from "vitest";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectGroup,
  SelectLabel,
} from "./select";

// Radix Select internally relies on ResizeObserver and pointer capture APIs,
// neither of which jsdom supports. We polyfill them and configure userEvent
// to skip pointer event validation so the portal renders correctly.
beforeAll(() => {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };

  // jsdom lacks pointer capture methods that Radix Select calls internally
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => {};
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => {};
  }

  // jsdom lacks scrollIntoView
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
});

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

  it("opens the dropdown when trigger is clicked", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderSelect();

    await user.click(screen.getByRole("combobox"));
    expect(screen.getByRole("option", { name: "LinkedIn" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Greenhouse" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Lever" })).toBeInTheDocument();
  });

  it("displays group label in dropdown", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderSelect();

    await user.click(screen.getByRole("combobox"));
    expect(screen.getByText("Platforms")).toBeInTheDocument();
  });

  it("selects an option when clicked", async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderSelect({ onValueChange });

    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByRole("option", { name: "LinkedIn" }));

    expect(onValueChange).toHaveBeenCalledWith("linkedin");
  });

  it("shows selected value in trigger", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
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
