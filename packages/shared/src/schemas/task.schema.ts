import { z } from "zod";
import {
  submissionBehavior,
  resumeRephraseMode,
  tailoringSummarySchema,
} from "./autonomy.schema.js";

// ─── Enums ───
export const taskStatus = z.enum([
  "created",
  "queued",
  "testing",
  "in_progress",
  "waiting_human",
  "completed",
  "failed",
  "cancelled",
]);

export const platform = z.enum(["linkedin", "greenhouse", "lever", "workday", "unknown"]);

export const applicationMode = z.enum(["copilot", "autopilot"]);

export const qualityPreset = z.enum(["speed", "balanced", "quality"]);

export const executionTarget = z.enum(["cloud", "desktop"]);

export const externalStatus = z.enum([
  "applied",
  "viewed",
  "interview",
  "rejected",
  "offer",
  "ghosted",
]);

// ─── Base Entity (mirrors DB row) ───
export const taskSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  jobUrl: z.string().url(),
  platform: platform,
  status: taskStatus,
  mode: applicationMode,
  resumeId: z.string().uuid().nullable().optional(),
  jobTitle: z.string().nullable().optional(),
  companyName: z.string().nullable().optional(),
  jobLocation: z.string().nullable().optional(),
  externalStatus: externalStatus.nullable().optional(),
  progress: z.number().min(0).max(100),
  currentStep: z.string().nullable().optional(),
  confidenceScore: z.number().min(0).max(1).nullable().optional(),
  matchScore: z.number().min(0).max(1).nullable().optional(),
  fieldsFilled: z.number().default(0),
  durationSeconds: z.number().nullable().optional(),
  errorCode: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  retryCount: z.number().default(0),
  workflowRunId: z.string().nullable().optional(),
  browserProfileId: z.string().uuid().nullable().optional(),
  screenshots: z.record(z.unknown()).nullable().optional(),
  llmUsage: z.record(z.unknown()).nullable().optional(),
  notes: z.string().nullable().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  startedAt: z.coerce.date().nullable().optional(),
  completedAt: z.coerce.date().nullable().optional(),
});

// ─── Supported Job URL Validation ───
const SUPPORTED_JOB_URL_PATTERNS: RegExp[] = [
  /linkedin\.com\/jobs\//i,
  /linkedin\.com\/job\//i,
  /greenhouse\.io\//i,
  /boards\.greenhouse\.io\//i,
  /lever\.co\//i,
  /myworkdayjobs\.com\//i,
  /myworkday\.com\//i,
  /workday\.com\/.*\/job\//i,
  /jobs\.ashbyhq\.com\//i,
  /icims\.com\//i,
  /smartrecruiters\.com\//i,
  /jobvite\.com\//i,
  /ultipro\.com\//i,
  /taleo\.net\//i,
  /brassring\.com\//i,
  /successfactors\.com\//i,
  /applytojob\.com\//i,
];

/** Returns true if the URL matches a supported job application site. */
export function isSupportedJobUrl(url: string): boolean {
  return SUPPORTED_JOB_URL_PATTERNS.some((pattern) => pattern.test(url));
}

// ─── Request DTOs ───
export const createTaskRequest = z.object({
  jobUrl: z
    .string()
    .url()
    .transform((s) => s.trim()),
  mode: applicationMode.default("copilot"),
  resumeId: z.string().uuid(),
  notes: z.string().max(1000).optional(),
  quality: qualityPreset.optional(),
  /** Optional sandbox UUID — routes the job to a specific GH worker. */
  targetWorkerId: z.string().uuid().optional(),
  /** LLM model alias for reasoning (e.g. "qwen-72b", "gpt-4.1"). Empty = GH default. */
  reasoningModel: z.string().max(100).optional(),
  /** Separate vision model for screenshots. Empty = same as reasoning model. */
  visionModel: z.string().max(100).optional(),
  /** Override per-task submission behavior. Absent = use user preference. */
  submissionBehavior: submissionBehavior.optional(),
  /** Resume rephrase strategy for this application. */
  resumeRephraseMode: resumeRephraseMode.optional(),
  /** UUID of a pre-tailored resume variant to use. */
  resumeVariantId: z.string().uuid().optional(),
  /** UUID of the job lead that spawned this task. */
  leadId: z.string().uuid().optional(),
  /** UUID of the platform credential to authenticate with. */
  credentialId: z.string().uuid().optional(),
  /** UUID of the mailbox credential for email verifications. */
  mailboxCredentialId: z.string().uuid().optional(),
  /** Where the task should execute: cloud (GH EC2) or desktop (local worker). */
  executionTarget: executionTarget.optional(),
  /** Desktop worker ID — required when executionTarget is "desktop". */
  desktopWorkerId: z.string().optional(),
});

export const taskListQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: taskStatus.optional(),
  platform: platform.optional(),
  search: z.string().max(200).optional(),
  sortBy: z
    .enum(["createdAt", "updatedAt", "status", "jobTitle", "companyName"])
    .default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  excludeTest: z.coerce.boolean().optional(),
});

export const updateExternalStatusRequest = z.object({
  externalStatus: externalStatus.nullable(),
});

export const taskExportQuery = z.object({
  format: z.enum(["csv"]).default("csv"),
});

// ─── Admin Schemas ───
export const adminTaskListQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  status: taskStatus.optional(),
  platform: platform.optional(),
  search: z.string().max(200).optional(),
  userId: z.string().uuid().optional(),
  sortBy: z
    .enum(["createdAt", "updatedAt", "status", "jobTitle", "companyName"])
    .default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export const adminTaskSyncResponse = z.object({
  taskId: z.string().uuid(),
  previousTaskStatus: taskStatus,
  newTaskStatus: taskStatus,
  ghApiStatus: z.string(),
  ghJobPreviousStatus: z.string().nullable(),
  taskUpdated: z.boolean(),
  ghJobUpdated: z.boolean(),
  message: z.string(),
});

// ─── Interaction Schemas ───
export const interactionType = z.enum([
  "captcha",
  "two_factor",
  "login_required",
  "bot_check",
  "rate_limited",
  "verification",
]);

export const taskInteractionSchema = z.object({
  type: interactionType,
  screenshotUrl: z.string().url().nullable().optional(),
  pageUrl: z.string().url().nullable().optional(),
  timeoutSeconds: z.number().int().positive().nullable().optional(),
  message: z.string().nullable().optional(),
  description: z.string().nullish(),
  metadata: z
    .object({
      blocker_confidence: z.number().optional(),
      captcha_type: z.string().optional(),
      detection_method: z.string().optional(),
    })
    .nullish(),
  pausedAt: z.coerce.date(),
});

export const resolveBlockerRequest = z.object({
  resolvedBy: z.enum(["human", "system"]).optional().default("human"),
  notes: z.string().max(1000).optional(),
  resolutionType: z.enum(["manual", "code_entry", "credentials", "skip"]).optional(),
  resolutionData: z.record(z.unknown()).optional(),
});

export const resolveBlockerResponse = z.object({
  taskId: z.string().uuid(),
  status: taskStatus,
  message: z.string(),
});

// ─── VNC URL Response ───
export const liveViewType = z.enum(["browser_session", "novnc", "kasm", "kasmvnc"]);
export type LiveViewType = z.infer<typeof liveViewType>;

export const vncUrlResponse = z.object({
  url: z.string(),
  readOnly: z.boolean(),
  type: liveViewType.default("novnc"),
});

export type VncUrlResponse = z.infer<typeof vncUrlResponse>;

// ─── Browser Session Response ───
export const browserSessionResponse = z.object({
  url: z.string().url(),
  expiresAt: z.string(),
  readOnly: z.boolean(),
  type: z.literal("browser_session"),
  mode: z.literal("simple_browser"),
  pageUrl: z.string().optional(),
  pageTitle: z.string().optional(),
});

export type BrowserSessionResponse = z.infer<typeof browserSessionResponse>;

// ─── GhostHands Job Data (enriched from GH API) ───
export const ghJobSchema = z.object({
  jobId: z.string(),
  ghStatus: z.string(),
  executionMode: z.string().nullable().optional(),
  progress: z.number().min(0).max(100).nullable().optional(),
  statusMessage: z.string().nullable().optional(),
  result: z.record(z.unknown()).nullable().optional(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
    })
    .nullable()
    .optional(),
  cost: z
    .object({
      totalCostUsd: z.number(),
      actionCount: z.number(),
      totalTokens: z.number(),
    })
    .nullable()
    .optional(),
  timestamps: z.object({
    createdAt: z.string(),
    startedAt: z.string().nullable().optional(),
    completedAt: z.string().nullable().optional(),
  }),
  targetWorkerId: z.string().nullable().optional(),
  browserSessionAvailable: z.boolean().optional(),
});

// ─── Response DTOs ───
export const taskResponse = taskSchema.extend({
  interaction: taskInteractionSchema.nullable().optional(),
  ghJob: ghJobSchema.nullable().optional(),
  /** UUID of the frozen resume snapshot used for this application. */
  resumeSnapshotId: z.string().uuid().nullable().optional(),
  /** Summary of resume tailoring applied before submission. */
  tailoringSummary: tailoringSummarySchema.nullable().optional(),
  /** Ordered list of recovery actions attempted after failure. */
  recoveryActions: z.array(z.string()).nullable().optional(),
  /** True if the failure is user-actionable (e.g. fix credentials). */
  actionableFailure: z.boolean().nullable().optional(),
  /** True if the failure is related to credential issues. */
  credentialIssue: z.boolean().nullable().optional(),
});

export const paginationSchema = z.object({
  page: z.number(),
  pageSize: z.number(),
  total: z.number(),
  totalPages: z.number(),
});

export const taskListResponse = z.object({
  data: z.array(taskResponse),
  pagination: paginationSchema,
});

export const taskStatsResponse = z.object({
  total: z.number(),
  completed: z.number(),
  inProgress: z.number(),
  needsReview: z.number(),
});

// ─── Submission Proof Pack ───
export const screenshotEntry = z.object({
  url: z.string().url(),
  label: z.string().nullable().optional(),
  capturedAt: z.coerce.date().nullable().optional(),
});

export const timelineEntry = z.object({
  step: z.string(),
  status: z.enum(["completed", "skipped", "failed"]),
  timestamp: z.coerce.date(),
  detail: z.string().nullable().optional(),
});

export const answerEntry = z.object({
  field: z.string(),
  value: z.string(),
  source: z.enum(["resume", "qa_bank", "llm", "user"]).nullable().optional(),
});

export const submissionProofResponse = z.object({
  taskId: z.string().uuid(),
  screenshots: z.array(screenshotEntry),
  answers: z.array(answerEntry),
  timeline: z.array(timelineEntry),
  externalStatus: externalStatus.nullable().optional(),
  confirmationData: z.record(z.unknown()).nullable().optional(),
  resumeVariantId: z.string().uuid().nullable().optional(),
  createdAt: z.coerce.date().nullable().optional(),
});

// ─── Batch Task Creation ───

/**
 * Normalize a job URL for deduplication: lowercase host, strip trailing slash, drop utm_* params.
 * Uses regex to avoid dependency on global URL (not available in all TS lib targets).
 */
export function normalizeJobUrl(raw: string): string {
  let url = raw.trim();

  // Lowercase the scheme + host portion (everything before the first '/' after '://')
  url = url.replace(/^(https?:\/\/)([^/]+)/i, (_m, scheme: string, host: string) => {
    return scheme.toLowerCase() + host.toLowerCase();
  });

  // Strip trailing slash(es) from path (before query/hash)
  url = url.replace(/\/+(?=\?|#|$)/, "");

  // Remove tracking query params (utm_*, ref, source)
  url = url.replace(
    /([?&])(utm_[^&]*|ref=[^&]*|source=[^&]*)(&?)/g,
    (_m, prefix: string, _param: string, suffix: string) => {
      // If this was the first param (?), keep the ? for remaining params
      if (prefix === "?" && suffix === "&") return "?";
      // If there's a following param, drop this one
      if (suffix === "&") return prefix;
      // Last param — drop the separator
      return "";
    },
  );

  // Clean up trailing ? or & with no params
  url = url.replace(/[?&]$/, "");

  return url || raw.trim();
}

const BATCH_MAX_URLS = 25;

/** Shared options applied to every URL in the batch. */
const batchSharedOptions = z.object({
  resumeId: z.string().uuid(),
  mode: applicationMode.default("copilot"),
  notes: z.string().max(1000).optional(),
  quality: qualityPreset.optional(),
  targetWorkerId: z.string().uuid().optional(),
  reasoningModel: z.string().max(100).optional(),
  visionModel: z.string().max(100).optional(),
  executionTarget: executionTarget.optional(),
  desktopWorkerId: z.string().optional(),
});

export const createBatchTaskRequest = batchSharedOptions.extend({
  jobUrls: z
    .array(z.string().url())
    .min(1, "At least one URL is required")
    .max(BATCH_MAX_URLS, `Maximum ${BATCH_MAX_URLS} URLs per batch`),
});

export const batchTaskResultItem = z.object({
  jobUrl: z.string(),
  status: z.enum(["created", "duplicate", "failed", "skipped"]),
  taskId: z.string().uuid().optional(),
  workflowRunId: z.string().optional(),
  error: z.string().optional(),
});

export const createBatchTaskResponse = z.object({
  results: z.array(batchTaskResultItem),
  summary: z.object({
    total: z.number(),
    created: z.number(),
    duplicates: z.number(),
    failed: z.number(),
    skipped: z.number(),
  }),
  balanceAfter: z.number().nullable(),
});

// ─── Inferred Types (NEVER hand-write these) ───
export type TaskStatus = z.infer<typeof taskStatus>;
export type Platform = z.infer<typeof platform>;
export type ApplicationMode = z.infer<typeof applicationMode>;
export type QualityPreset = z.infer<typeof qualityPreset>;
export type ExecutionTarget = z.infer<typeof executionTarget>;
export type ExternalStatus = z.infer<typeof externalStatus>;
export type Task = z.infer<typeof taskSchema>;
export type CreateTaskRequest = z.infer<typeof createTaskRequest>;
export type TaskListQuery = z.infer<typeof taskListQuery>;
export type TaskResponse = z.infer<typeof taskResponse>;
export type TaskListResponse = z.infer<typeof taskListResponse>;
export type Pagination = z.infer<typeof paginationSchema>;
export type TaskStatsResponse = z.infer<typeof taskStatsResponse>;
export type UpdateExternalStatusRequest = z.infer<typeof updateExternalStatusRequest>;
export type TaskExportQuery = z.infer<typeof taskExportQuery>;
export type InteractionType = z.infer<typeof interactionType>;
export type TaskInteraction = z.infer<typeof taskInteractionSchema>;
export type ResolveBlockerRequest = z.infer<typeof resolveBlockerRequest>;
export type ResolveBlockerResponse = z.infer<typeof resolveBlockerResponse>;
export type GhJob = z.infer<typeof ghJobSchema>;
export type AdminTaskListQuery = z.infer<typeof adminTaskListQuery>;
export type AdminTaskSyncResponse = z.infer<typeof adminTaskSyncResponse>;
export type SubmissionProofResponse = z.infer<typeof submissionProofResponse>;
export type ScreenshotEntry = z.infer<typeof screenshotEntry>;
export type TimelineEntry = z.infer<typeof timelineEntry>;
export type AnswerEntry = z.infer<typeof answerEntry>;
export type CreateBatchTaskRequest = z.infer<typeof createBatchTaskRequest>;
export type BatchTaskResultItem = z.infer<typeof batchTaskResultItem>;
export type CreateBatchTaskResponse = z.infer<typeof createBatchTaskResponse>;
