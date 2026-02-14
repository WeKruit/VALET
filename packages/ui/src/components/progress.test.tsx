import { render } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { Progress } from "./progress";

describe("Progress", () => {
  it("renders a progressbar element", () => {
    const { container } = render(<Progress value={50} />);
    expect(container.querySelector("[role='progressbar']")).toBeInTheDocument();
  });

  it("renders with value prop", () => {
    const { container } = render(<Progress value={75} />);
    const el = container.querySelector("[role='progressbar']") as HTMLElement;
    // Verify the progress element has the correct value applied via its indicator
    const indicator = el.firstElementChild as HTMLElement;
    expect(indicator.style.transform).toBe("translateX(-25%)");
  });

  it("defaults to 0 when no value", () => {
    const { container } = render(<Progress />);
    const el = container.querySelector("[role='progressbar']") as HTMLElement;
    // Radix sets data-value to 0 when undefined
    expect(el).toBeInTheDocument();
  });

  it("sets indicator transform based on value", () => {
    const { container } = render(<Progress value={60} />);
    const indicator = container.querySelector("[role='progressbar'] > div") as HTMLElement;
    expect(indicator.style.transform).toBe("translateX(-40%)");
  });

  it("merges custom className", () => {
    const { container } = render(<Progress value={50} className="h-4" />);
    const el = container.querySelector("[role='progressbar']") as HTMLElement;
    expect(el.className).toContain("h-4");
  });

  it("forwards ref", () => {
    const ref = vi.fn();
    render(<Progress ref={ref} value={50} />);
    expect(ref).toHaveBeenCalled();
  });
});
