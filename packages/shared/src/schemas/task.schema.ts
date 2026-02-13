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

// ─── Base Entity (mirrors DB row, minus internal-only fields) ───
export const taskSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  jobUrl: z.string().url(),
  platform: platform,
  status: taskStatus,
  mode: applicationMode,
  progress: z.number().min(0).max(100),
  currentStep: z.string().nullable(),
  confidenceScore: z.number().min(0).max(1).nullable(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  completedAt: z.coerce.date().nullable(),
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
  sortBy: z.enum(["createdAt", "updatedAt", "status"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
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
export type Task = z.infer<typeof taskSchema>;
export type CreateTaskRequest = z.infer<typeof createTaskRequest>;
export type TaskListQuery = z.infer<typeof taskListQuery>;
export type TaskResponse = z.infer<typeof taskResponse>;
export type TaskListResponse = z.infer<typeof taskListResponse>;
export type Pagination = z.infer<typeof paginationSchema>;
export type TaskStatsResponse = z.infer<typeof taskStatsResponse>;
