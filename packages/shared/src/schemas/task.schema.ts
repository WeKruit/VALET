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

export const platform = z.enum([
  "linkedin",
  "greenhouse",
  "lever",
  "workday",
  "unknown",
]);

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
  jobUrl: z.string().url().transform((s) => s.trim()),
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
  sortBy: z.enum(["createdAt", "updatedAt", "status", "jobTitle", "companyName"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export const updateExternalStatusRequest = z.object({
  externalStatus: externalStatus.nullable(),
});

export const taskExportQuery = z.object({
  format: z.enum(["csv"]).default("csv"),
});

// ─── Response DTOs ───
export const taskResponse = taskSchema;

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
