import { z } from "zod";

export const qaCategory = z.enum([
  "work_authorization",
  "experience",
  "compensation",
  "availability",
  "identity",
  "custom",
]);

export const qaUsageMode = z.enum(["always_use", "ask_each_time", "decline_to_answer"]);

export const answerSource = z.enum(["user_input", "resume_inferred", "application_learned"]);

export const qaEntrySchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  category: qaCategory,
  question: z.string(),
  answer: z.string(),
  usageMode: qaUsageMode,
  source: answerSource,
  timesUsed: z.number().int().min(0),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const createQaEntryRequest = z.object({
  category: qaCategory,
  question: z.string().min(1).max(1000),
  answer: z.string().min(1).max(5000),
  usageMode: qaUsageMode.default("always_use"),
  source: answerSource.default("user_input"),
});

export const updateQaEntryRequest = z.object({
  answer: z.string().min(1).max(5000).optional(),
  usageMode: qaUsageMode.optional(),
});

export const qaEntryResponse = qaEntrySchema;

export const qaListResponse = z.object({
  data: z.array(qaEntryResponse),
});

// ─── Inferred Types ───
export type QaCategory = z.infer<typeof qaCategory>;
export type QaUsageMode = z.infer<typeof qaUsageMode>;
export type AnswerSource = z.infer<typeof answerSource>;
export type QaEntry = z.infer<typeof qaEntrySchema>;
export type CreateQaEntryRequest = z.infer<typeof createQaEntryRequest>;
export type UpdateQaEntryRequest = z.infer<typeof updateQaEntryRequest>;
export type QaEntryResponse = z.infer<typeof qaEntryResponse>;
export type QaListResponse = z.infer<typeof qaListResponse>;
