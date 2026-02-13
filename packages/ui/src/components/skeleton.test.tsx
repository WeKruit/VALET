import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Skeleton } from "./skeleton";

describe("Skeleton", () => {
  it("renders a div element", () => {
    const { container } = render(<Skeleton />);
    expect(container.firstChild).toBeInstanceOf(HTMLDivElement);
  });

  it("applies animate-pulse class", () => {
    const { container } = render(<Skeleton />);
    expect((container.firstChild as HTMLElement).className).toContain("animate-pulse");
  });

  it("merges custom className", () => {
    const { container } = render(<Skeleton className="h-4 w-32" />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("h-4");
    expect(el.className).toContain("w-32");
  });

  it("passes through data attributes", () => {
    const { container } = render(<Skeleton data-testid="skeleton" />);
    expect(container.firstChild).toHaveAttribute("data-testid", "skeleton");
  });

  it("renders children if provided", () => {
    const { container } = render(<Skeleton><span>Loading</span></Skeleton>);
    expect(container.querySelector("span")).toHaveTextContent("Loading");
  });
});
