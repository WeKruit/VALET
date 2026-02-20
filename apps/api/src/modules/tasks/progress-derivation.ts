/**
 * WEK-71: Derive task progress from gh_job_events instead of duplicate tracking.
 * This module maps GH event types to progress steps so the frontend can compute
 * progress on-the-fly from the events timeline.
 */

export interface ProgressStep {
  step: number;
  label: string;
}

export const EVENT_PROGRESS_MAP: Record<string, ProgressStep> = {
  job_started: { step: 1, label: "Starting automation" },
  browser_launched: { step: 2, label: "Browser launched" },
  page_navigated: { step: 3, label: "Navigating to application" },
  form_detected: { step: 4, label: "Analyzing form" },
  step_started: { step: 5, label: "Filling fields" },
  step_completed: { step: 6, label: "Fields completed" },
  review_started: { step: 7, label: "Reviewing submission" },
  submission_started: { step: 8, label: "Submitting application" },
  job_completed: { step: 9, label: "Application submitted" },
};

export const TOTAL_STEPS = 9;

export interface DerivedProgress {
  progress: number;
  currentStep: string;
  stepIndex: number;
  totalSteps: number;
}

export function deriveProgressFromEvents(
  events: Array<{ eventType: string | null; createdAt: string | Date }>,
): DerivedProgress {
  let highestStep = 0;
  let currentLabel = "Queued";

  for (const event of events) {
    if (!event.eventType) continue;
    const mapped = EVENT_PROGRESS_MAP[event.eventType];
    if (mapped && mapped.step > highestStep) {
      highestStep = mapped.step;
      currentLabel = mapped.label;
    }
  }

  return {
    progress: highestStep === 0 ? 0 : Math.round((highestStep / TOTAL_STEPS) * 100),
    currentStep: currentLabel,
    stepIndex: highestStep,
    totalSteps: TOTAL_STEPS,
  };
}
