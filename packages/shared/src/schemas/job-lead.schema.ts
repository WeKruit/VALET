import { z } from "zod";
import { platform } from "./task.schema.js";

// ─── Enums ───

export const jobLeadStatus = z.enum([
  "saved",
  "reviewing",
  "queued",
  "applied",
  "rejected",
  "archived",
]);

export const jobLeadSource = z.enum(["manual", "url_import", "browser_extension", "search_result"]);

// ─── Schemas ───

export const jobLeadResponse = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  jobUrl: z.string(),
  platform: platform,
  title: z.string(),
  company: z.string(),
  location: z.string().nullable(),
  matchScore: z.number().int().nullable(),
  source: jobLeadSource,
  status: jobLeadStatus,
  taskId: z.string().uuid().nullable(),
  createdAt: z.string().or(z.date()),
});

export const jobLeadListResponse = z.object({
  data: z.array(jobLeadResponse),
  total: z.number(),
});

export const jobLeadListQuery = z.object({
  status: jobLeadStatus.optional(),
  platform: platform.optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const createJobLeadBody = z.object({
  title: z.string().min(1).max(500),
  company: z.string().min(1).max(500),
  jobUrl: z.string().url(),
  platform: platform.default("unknown"),
  location: z.string().max(500).optional(),
  source: jobLeadSource.default("manual"),
});

export const importJobUrlBody = z.object({
  url: z.string().url(),
});

export const importJobUrlResponse = z.object({
  id: z.string().uuid(),
  title: z.string(),
  company: z.string(),
  platform: platform,
  jobUrl: z.string(),
  location: z.string().nullable(),
});

export const updateJobLeadBody = z.object({
  title: z.string().min(1).max(500).optional(),
  company: z.string().min(1).max(500).optional(),
  location: z.string().max(500).nullable().optional(),
  status: jobLeadStatus.optional(),
});

export const queueForApplicationBody = z.object({
  resumeId: z.string().uuid().optional(),
});

// ─── Inferred Types ───

export type JobLeadStatus = z.infer<typeof jobLeadStatus>;
export type JobLeadSource = z.infer<typeof jobLeadSource>;
export type JobLead = z.infer<typeof jobLeadResponse>;
export type JobLeadListQuery = z.infer<typeof jobLeadListQuery>;
export type CreateJobLeadBody = z.infer<typeof createJobLeadBody>;
export type UpdateJobLeadBody = z.infer<typeof updateJobLeadBody>;
