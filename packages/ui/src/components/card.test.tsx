import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "./card";

describe("Card", () => {
  it("renders with children", () => {
    render(<Card>Card content</Card>);
    expect(screen.getByText("Card content")).toBeInTheDocument();
  });

  it("merges custom className", () => {
    render(<Card className="my-card">Content</Card>);
    expect(screen.getByText("Content").className).toContain("my-card");
  });

  it("forwards ref", () => {
    const ref = vi.fn();
    render(<Card ref={ref}>Ref test</Card>);
    expect(ref).toHaveBeenCalledWith(expect.any(HTMLDivElement));
  });

  it("passes through HTML attributes", () => {
    render(<Card data-testid="test-card">Content</Card>);
    expect(screen.getByTestId("test-card")).toBeInTheDocument();
  });
});

describe("CardHeader", () => {
  it("renders with children", () => {
    render(<CardHeader>Header</CardHeader>);
    expect(screen.getByText("Header")).toBeInTheDocument();
  });

  it("merges custom className", () => {
    render(<CardHeader className="custom-header">Header</CardHeader>);
    expect(screen.getByText("Header").className).toContain("custom-header");
  });
});

describe("CardTitle", () => {
  it("renders as h3 element", () => {
    render(<CardTitle>Title</CardTitle>);
    const heading = screen.getByRole("heading", { level: 3 });
    expect(heading).toHaveTextContent("Title");
  });

  it("applies display font classes", () => {
    render(<CardTitle>Title</CardTitle>);
    const heading = screen.getByRole("heading");
    expect(heading.className).toContain("font-display");
  });
});

describe("CardDescription", () => {
  it("renders as a paragraph", () => {
    render(<CardDescription>Description text</CardDescription>);
    const p = screen.getByText("Description text");
    expect(p.tagName).toBe("P");
  });

  it("applies secondary text color", () => {
    render(<CardDescription>Description</CardDescription>);
    expect(screen.getByText("Description").className).toContain(
      "text-[var(--wk-text-secondary)]"
    );
  });
});

describe("CardContent", () => {
  it("renders with children", () => {
    render(<CardContent>Body content</CardContent>);
    expect(screen.getByText("Body content")).toBeInTheDocument();
  });
});

describe("CardFooter", () => {
  it("renders with children", () => {
    render(<CardFooter>Footer content</CardFooter>);
    expect(screen.getByText("Footer content")).toBeInTheDocument();
  });

  it("uses flex layout", () => {
    render(<CardFooter>Footer</CardFooter>);
    expect(screen.getByText("Footer").className).toContain("flex");
  });
});

describe("Card composition", () => {
  it("renders a full card with all subcomponents", () => {
    render(
      <Card data-testid="full-card">
        <CardHeader>
          <CardTitle>Task Status</CardTitle>
          <CardDescription>Your application progress</CardDescription>
        </CardHeader>
        <CardContent>
          <p>Application in progress...</p>
        </CardContent>
        <CardFooter>
          <button>Cancel</button>
        </CardFooter>
      </Card>
    );

    expect(screen.getByTestId("full-card")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Task Status" })).toBeInTheDocument();
    expect(screen.getByText("Your application progress")).toBeInTheDocument();
    expect(screen.getByText("Application in progress...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });
});
