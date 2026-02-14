import { z } from "zod";

// ─── Enums ───
export const applicationFieldSource = z.enum([
  "resume",
  "qa_bank",
  "llm_generated",
  "user_input",
]);

export const applicationFieldType = z.enum([
  "text",
  "textarea",
  "select",
  "radio",
  "checkbox",
  "file",
  "date",
]);

// ─── Application Field (mirrors application_fields DB row) ───
export const applicationFieldSchema = z.object({
  id: z.string().uuid(),
  applicationId: z.string().uuid(),
  fieldName: z.string().max(255),
  fieldValue: z.string().nullable().optional(),
  createdAt: z.coerce.date(),
});

// ─── Application Result (mirrors application_results DB row) ───
export const applicationResultSchema = z.object({
  id: z.string().uuid(),
  taskId: z.string().uuid(),
  fieldName: z.string().max(255),
  fieldType: z.string().max(50),
  value: z.string().nullable().optional(),
  source: z.string().max(50),
  confidence: z.number().min(0).max(1),
  qaBankEntryId: z.string().uuid().nullable().optional(),
  userOverridden: z.boolean().default(false),
  metadata: z.record(z.unknown()).nullable().optional(),
  filledAt: z.coerce.date(),
});

// ─── Request DTOs ───
export const createApplicationFieldRequest = z.object({
  applicationId: z.string().uuid(),
  fieldName: z.string().min(1).max(255),
  fieldValue: z.string().nullable().optional(),
});

export const createApplicationResultRequest = z.object({
  taskId: z.string().uuid(),
  fieldName: z.string().min(1).max(255),
  fieldType: applicationFieldType,
  value: z.string().nullable().optional(),
  source: applicationFieldSource,
  confidence: z.number().min(0).max(1),
  qaBankEntryId: z.string().uuid().nullable().optional(),
  userOverridden: z.boolean().default(false),
  metadata: z.record(z.unknown()).nullable().optional(),
});

// ─── Response DTOs ───
export const applicationFieldResponse = applicationFieldSchema;
export const applicationResultResponse = applicationResultSchema;

export const applicationFieldListResponse = z.object({
  data: z.array(applicationFieldResponse),
});

export const applicationResultListResponse = z.object({
  data: z.array(applicationResultResponse),
});

// ─── Inferred Types (NEVER hand-write these) ───
export type ApplicationFieldSource = z.infer<typeof applicationFieldSource>;
export type ApplicationFieldType = z.infer<typeof applicationFieldType>;
export type ApplicationField = z.infer<typeof applicationFieldSchema>;
export type ApplicationResult = z.infer<typeof applicationResultSchema>;
export type CreateApplicationFieldRequest = z.infer<typeof createApplicationFieldRequest>;
export type CreateApplicationResultRequest = z.infer<typeof createApplicationResultRequest>;
export type ApplicationFieldResponse = z.infer<typeof applicationFieldResponse>;
export type ApplicationResultResponse = z.infer<typeof applicationResultResponse>;
export type ApplicationFieldListResponse = z.infer<typeof applicationFieldListResponse>;
export type ApplicationResultListResponse = z.infer<typeof applicationResultListResponse>;
