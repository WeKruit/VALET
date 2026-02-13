/** Rate limits per user per day */
export const RATE_LIMITS = {
  COPILOT_DAILY: 25,
  AUTOPILOT_DAILY: 10,
  RESUME_UPLOADS_DAILY: 10,
  QA_ENTRIES_MAX: 500,
} as const;

/** File upload constraints */
export const UPLOAD_LIMITS = {
  MAX_RESUME_SIZE_BYTES: 10 * 1024 * 1024, // 10MB
  ALLOWED_MIME_TYPES: [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ] as const,
} as const;

/** WebSocket heartbeat config */
export const WS_CONFIG = {
  HEARTBEAT_INTERVAL_MS: 30_000,
  RECONNECT_MAX_DELAY_MS: 30_000,
  RECONNECT_BASE_DELAY_MS: 1_000,
} as const;

/** Pagination defaults */
export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
} as const;

/** Task workflow steps (ordered) */
export const TASK_STEPS = [
  "queued",
  "starting_browser",
  "navigating",
  "analyzing_page",
  "filling_form",
  "waiting_review",
  "submitting",
  "verifying",
  "completed",
] as const;

export type TaskStep = (typeof TASK_STEPS)[number];
