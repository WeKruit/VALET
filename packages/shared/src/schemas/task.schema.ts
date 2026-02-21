import { z } from "zod";

// ─── Enums ───
export const taskStatus = z.enum([
  "created",
  "queued",
  "in_progress",
  "waiting_human",
  "completed",
  "failed",
  "cancelled",
]);

export const platform = z.enum(["linkedin", "greenhouse", "lever", "workday", "unknown"]);

export const applicationMode = z.enum(["copilot", "autopilot"]);

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

// ─── Request DTOs ───
export const createTaskRequest = z.object({
  jobUrl: z
    .string()
    .url()
    .transform((s) => s.trim()),
  mode: applicationMode.default("copilot"),
  resumeId: z.string().uuid(),
  notes: z.string().max(1000).optional(),
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
export const vncUrlResponse = z.object({
  url: z.string(),
  readOnly: z.boolean(),
});

export type VncUrlResponse = z.infer<typeof vncUrlResponse>;

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
});

// ─── Response DTOs ───
export const taskResponse = taskSchema.extend({
  interaction: taskInteractionSchema.nullable().optional(),
  ghJob: ghJobSchema.nullable().optional(),
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

// ─── Inferred Types (NEVER hand-write these) ───
export type TaskStatus = z.infer<typeof taskStatus>;
export type Platform = z.infer<typeof platform>;
export type ApplicationMode = z.infer<typeof applicationMode>;
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
