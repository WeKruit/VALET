/**
 * Data retention policy for WeKruit Valet.
 *
 * Values represent the number of days data is retained before
 * eligible for automated deletion. Aligned with GDPR Article 5(1)(e)
 * storage limitation principle and doc 06 Section 4.2 retention schedule.
 */
export const RETENTION_POLICY = {
  /** Screenshots of application submissions (user-configurable within range) */
  SCREENSHOTS: 30,
  /** Individual task/application event records */
  TASK_EVENTS: 90,
  /** Completed task metadata (for application history) */
  COMPLETED_TASKS: 365,
  /** Grace period after account deletion before permanent erasure */
  DELETED_ACCOUNT: 30,
  /** LLM prompt/response logs for debugging and explainability */
  LLM_LOGS: 90,
  /** Immutable audit trail records (2 years — statute of limitations) */
  AUDIT_TRAIL: 730,
  /** Consent records (retained for the life of the account + 2 years) */
  CONSENT_RECORDS: 730,
  /** Session metadata for Autopilot sessions */
  SESSION_METADATA: 365,
  /** Job posting content cached for matching */
  JOB_POSTINGS: 90,
} as const;

export type RetentionCategory = keyof typeof RETENTION_POLICY;

/**
 * Screenshot retention range users can configure.
 * Minimum 30 days (default), maximum 90 days.
 */
export const SCREENSHOT_RETENTION_RANGE = {
  MIN_DAYS: 30,
  MAX_DAYS: 90,
  DEFAULT_DAYS: 30,
} as const;
