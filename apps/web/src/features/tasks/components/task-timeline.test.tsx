import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { TaskTimeline, resolveSteps } from "./task-timeline";
import type { GhJobEvent } from "./task-timeline";

vi.mock("@/lib/utils", () => ({ cn: (...args: unknown[]) => args.filter(Boolean).join(" ") }));

function makeEvent(
  eventType: string,
  createdAt: string,
  overrides: Partial<{ id: string; message: string; metadata: Record<string, unknown> }> = {},
): GhJobEvent {
  return {
    id: overrides.id ?? `ev-${eventType}`,
    eventType,
    fromStatus: null,
    toStatus: null,
    message: overrides.message ?? `${eventType} event`,
    metadata: overrides.metadata ?? null,
    actor: null,
    createdAt,
  };
}

const T0 = "2026-02-19T10:00:00.000Z";
const at = (s: number) => new Date(new Date(T0).getTime() + s * 1000).toISOString();

const fullEvents: GhJobEvent[] = [
  makeEvent("job_started", at(2)),
  makeEvent("browser_launched", at(5)),
  makeEvent("page_navigated", at(10)),
  makeEvent("form_detected", at(15)),
  makeEvent("step_started", at(20), { message: "Filling first name" }),
  makeEvent("step_completed", at(30), { message: "Filled first name" }),
  makeEvent("step_started", at(32), { message: "Filling last name", id: "ev-ss2" }),
  makeEvent("step_completed", at(40), { message: "Filled last name", id: "ev-sc2" }),
  makeEvent("observation_started", at(45)),
  makeEvent("step_started", at(55), { message: "Submitting form", id: "ev-ss3" }),
  makeEvent("job_completed", at(60), {
    message: "Application submitted",
    metadata: { totalCostUsd: 0.01 },
  }),
];

describe("resolveSteps", () => {
  it("resolves all milestones for complete lifecycle", () => {
    const steps = resolveSteps(fullEvents, {
      status: "completed",
      createdAt: T0,
      completedAt: at(60),
    });
    expect(steps).toHaveLength(10);
    expect(steps.every((s) => s.status === "complete")).toBe(true);
  });
  it("marks first pending as current for active task", () => {
    const steps = resolveSteps(
      [makeEvent("job_started", at(2)), makeEvent("browser_launched", at(5))],
      { status: "in_progress", createdAt: T0 },
    );
    expect(steps.find((s) => s.status === "current")?.milestone.label).toBe("Page Loaded");
  });
  it("shows Failed for job_failed", () => {
    const steps = resolveSteps(
      [makeEvent("job_started", at(2)), makeEvent("job_failed", at(15), { message: "Timeout" })],
      { status: "failed", createdAt: T0 },
    );
    const t = steps.find((s) => s.milestone.id === "terminal");
    expect(t?.status).toBe("error");
    expect(t?.detail).toBe("Timeout");
  });
  it("injects HITL step on blocker_detected", () => {
    const steps = resolveSteps(
      [
        makeEvent("job_started", at(2)),
        makeEvent("blocker_detected", at(10), { metadata: { blockerType: "captcha" } }),
      ],
      { status: "waiting_human", createdAt: T0 },
    );
    const h = steps.find((s) => s.milestone.id === "hitl");
    expect(h?.status).toBe("warning");
    expect(h?.detail).toBe("captcha");
  });
  it("only Queued complete with no events", () => {
    const steps = resolveSteps([], { status: "queued", createdAt: T0 });
    expect(steps[0]!.status).toBe("complete");
    expect(steps.find((s) => s.status === "current")?.milestone.label).toBe("Job Started");
  });
});

describe("TaskTimeline", () => {
  it("renders all milestone labels", () => {
    render(
      <TaskTimeline
        events={fullEvents}
        task={{ status: "completed", createdAt: T0, completedAt: at(60) }}
      />,
    );
    for (const l of [
      "Queued",
      "Job Started",
      "Browser Ready",
      "Page Loaded",
      "Form Analyzed",
      "Filling Fields",
      "Fields Complete",
      "Review",
      "Submitting",
      "Completed",
    ])
      expect(screen.getByText(l)).toBeInTheDocument();
  });
  it("shows Live for non-terminal", () => {
    render(
      <TaskTimeline
        events={[makeEvent("job_started", at(2))]}
        task={{ status: "in_progress", createdAt: T0 }}
      />,
    );
    expect(screen.getByText("Live")).toBeInTheDocument();
  });
  it("hides Live for terminal", () => {
    render(
      <TaskTimeline
        events={fullEvents}
        task={{ status: "completed", createdAt: T0, completedAt: at(60) }}
      />,
    );
    expect(screen.queryByText("Live")).not.toBeInTheDocument();
  });
  it("shows total duration", () => {
    render(
      <TaskTimeline
        events={fullEvents}
        task={{ status: "completed", createdAt: T0, completedAt: at(60) }}
      />,
    );
    expect(screen.getByText(/Total:/)).toBeInTheDocument();
  });
  it("shows step durations", () => {
    render(
      <TaskTimeline
        events={[makeEvent("job_started", at(2)), makeEvent("browser_launched", at(12))]}
        task={{ status: "in_progress", createdAt: T0 }}
      />,
    );
    expect(screen.getByText("2s")).toBeInTheDocument();
    expect(screen.getByText("10s")).toBeInTheDocument();
  });
  it("renders empty state", () => {
    render(<TaskTimeline events={[]} task={{ status: "created", createdAt: T0 }} />);
    expect(
      screen.getAllByText(
        /Queued|Job Started|Browser Ready|Page Loaded|Form Analyzed|Filling Fields|Fields Complete|Review|Submitting|Completed/,
      ).length,
    ).toBeGreaterThanOrEqual(10);
  });
  it("shows HITL Pause", () => {
    render(
      <TaskTimeline
        events={[
          makeEvent("job_started", at(2)),
          makeEvent("blocker_detected", at(10), { metadata: { blockerType: "captcha" } }),
        ]}
        task={{ status: "waiting_human", createdAt: T0 }}
      />,
    );
    expect(screen.getByText("HITL Pause")).toBeInTheDocument();
  });
  it("shows Failed with error", () => {
    render(
      <TaskTimeline
        events={[
          makeEvent("job_started", at(2)),
          makeEvent("job_failed", at(10), { message: "Timeout" }),
        ]}
        task={{ status: "failed", createdAt: T0, completedAt: at(10) }}
      />,
    );
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getByText("Timeout")).toBeInTheDocument();
  });
});
