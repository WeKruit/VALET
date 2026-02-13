import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import {
  ToastProvider,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastAction,
  ToastClose,
} from "./toast";

function renderToast(variant?: "default" | "success" | "warning" | "destructive") {
  return render(
    <ToastProvider>
      <Toast open variant={variant} data-testid="toast">
        <ToastTitle>Notification</ToastTitle>
        <ToastDescription>Something happened</ToastDescription>
        <ToastAction altText="Undo">Undo</ToastAction>
        <ToastClose />
      </Toast>
      <ToastViewport />
    </ToastProvider>
  );
}

describe("Toast", () => {
  it("renders toast with title and description", () => {
    renderToast();
    expect(screen.getByText("Notification")).toBeInTheDocument();
    expect(screen.getByText("Something happened")).toBeInTheDocument();
  });

  it("renders toast action button", () => {
    renderToast();
    expect(screen.getByText("Undo")).toBeInTheDocument();
  });

  it("renders with default variant", () => {
    renderToast("default");
    const toast = screen.getByTestId("toast");
    expect(toast.className).toContain("bg-[var(--wk-surface-white)]");
  });

  it("renders with success variant", () => {
    renderToast("success");
    const toast = screen.getByTestId("toast");
    expect(toast.className).toContain("bg-emerald-50");
  });

  it("renders with warning variant", () => {
    renderToast("warning");
    const toast = screen.getByTestId("toast");
    expect(toast.className).toContain("bg-amber-50");
  });

  it("renders with destructive variant", () => {
    renderToast("destructive");
    const toast = screen.getByTestId("toast");
    expect(toast.className).toContain("bg-red-50");
  });

  it("renders the viewport", () => {
    render(
      <ToastProvider>
        <ToastViewport data-testid="viewport" />
      </ToastProvider>
    );
    expect(screen.getByTestId("viewport")).toBeInTheDocument();
  });
});
