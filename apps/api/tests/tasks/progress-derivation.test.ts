import { describe, it, expect } from "vitest";
import {
  deriveProgressFromEvents,
  EVENT_PROGRESS_MAP,
  TOTAL_STEPS,
} from "../../src/modules/tasks/progress-derivation";

describe("deriveProgressFromEvents", () => {
  it("returns zero progress for empty events", () => {
    const result = deriveProgressFromEvents([]);
    expect(result.progress).toBe(0);
    expect(result.currentStep).toBe("Queued");
    expect(result.stepIndex).toBe(0);
    expect(result.totalSteps).toBe(TOTAL_STEPS);
  });

  it("returns correct progress for a single event", () => {
    const result = deriveProgressFromEvents([
      { eventType: "job_started", createdAt: "2026-01-01T00:00:00Z" },
    ]);
    expect(result.progress).toBe(Math.round((1 / TOTAL_STEPS) * 100));
    expect(result.currentStep).toBe("Starting automation");
    expect(result.stepIndex).toBe(1);
  });

  it("returns correct progress for a partial chain", () => {
    const result = deriveProgressFromEvents([
      { eventType: "job_started", createdAt: "2026-01-01T00:00:00Z" },
      { eventType: "browser_launched", createdAt: "2026-01-01T00:00:01Z" },
      { eventType: "page_navigated", createdAt: "2026-01-01T00:00:02Z" },
      { eventType: "form_detected", createdAt: "2026-01-01T00:00:03Z" },
    ]);
    expect(result.progress).toBe(Math.round((4 / TOTAL_STEPS) * 100));
    expect(result.currentStep).toBe("Analyzing form");
    expect(result.stepIndex).toBe(4);
  });

  it("returns 100% for full chain", () => {
    const events = Object.keys(EVENT_PROGRESS_MAP).map((type, i) => ({
      eventType: type,
      createdAt: new Date(2026, 0, 1, 0, 0, i).toISOString(),
    }));
    const result = deriveProgressFromEvents(events);
    expect(result.progress).toBe(100);
    expect(result.currentStep).toBe("Application submitted");
    expect(result.stepIndex).toBe(TOTAL_STEPS);
  });

  it("ignores unknown event types", () => {
    const result = deriveProgressFromEvents([
      { eventType: "job_started", createdAt: "2026-01-01T00:00:00Z" },
      { eventType: "some_random_event", createdAt: "2026-01-01T00:00:01Z" },
      { eventType: "heartbeat", createdAt: "2026-01-01T00:00:02Z" },
    ]);
    expect(result.progress).toBe(Math.round((1 / TOTAL_STEPS) * 100));
    expect(result.currentStep).toBe("Starting automation");
  });

  it("handles out-of-order events by taking highest step", () => {
    const result = deriveProgressFromEvents([
      { eventType: "form_detected", createdAt: "2026-01-01T00:00:00Z" },
      { eventType: "job_started", createdAt: "2026-01-01T00:00:01Z" },
      { eventType: "step_started", createdAt: "2026-01-01T00:00:02Z" },
    ]);
    expect(result.progress).toBe(Math.round((5 / TOTAL_STEPS) * 100));
    expect(result.currentStep).toBe("Filling fields");
  });

  it("skips events with null eventType", () => {
    const result = deriveProgressFromEvents([
      { eventType: null, createdAt: "2026-01-01T00:00:00Z" },
      { eventType: "job_started", createdAt: "2026-01-01T00:00:01Z" },
      { eventType: null, createdAt: "2026-01-01T00:00:02Z" },
    ]);
    expect(result.progress).toBe(Math.round((1 / TOTAL_STEPS) * 100));
  });

  it("handles duplicate events", () => {
    const result = deriveProgressFromEvents([
      { eventType: "job_started", createdAt: "2026-01-01T00:00:00Z" },
      { eventType: "job_started", createdAt: "2026-01-01T00:00:01Z" },
      { eventType: "browser_launched", createdAt: "2026-01-01T00:00:02Z" },
    ]);
    expect(result.progress).toBe(Math.round((2 / TOTAL_STEPS) * 100));
    expect(result.currentStep).toBe("Browser launched");
  });

  it("validates EVENT_PROGRESS_MAP has TOTAL_STEPS entries", () => {
    expect(Object.keys(EVENT_PROGRESS_MAP).length).toBe(TOTAL_STEPS);
  });

  it("validates all steps in MAP are sequential 1..TOTAL_STEPS", () => {
    const steps = Object.values(EVENT_PROGRESS_MAP)
      .map((s) => s.step)
      .sort((a, b) => a - b);
    for (let i = 0; i < steps.length; i++) {
      expect(steps[i]).toBe(i + 1);
    }
  });
});
