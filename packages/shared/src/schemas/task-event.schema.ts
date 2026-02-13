import { z } from "zod";

export const taskEventType = z.enum([
  "state_change",
  "field_filled",
  "screenshot_taken",
  "llm_decision",
  "error",
  "captcha_detected",
  "human_takeover",
  "checkpoint",
]);

export const taskEventSchema = z.object({
  id: z.string().uuid(),
  taskId: z.string().uuid(),
  eventType: taskEventType,
  fromStatus: z.string().nullable(),
  toStatus: z.string().nullable(),
  eventData: z.record(z.unknown()),
  createdAt: z.coerce.date(),
});

export const taskEventResponse = taskEventSchema;

export const taskEventListResponse = z.object({
  data: z.array(taskEventResponse),
  pagination: z.object({
    page: z.number(),
    pageSize: z.number(),
    total: z.number(),
    totalPages: z.number(),
  }),
});

export const taskEventListQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  eventType: taskEventType.optional(),
});

// ─── Inferred Types ───
export type TaskEventType = z.infer<typeof taskEventType>;
export type TaskEvent = z.infer<typeof taskEventSchema>;
export type TaskEventResponse = z.infer<typeof taskEventResponse>;
export type TaskEventListResponse = z.infer<typeof taskEventListResponse>;
export type TaskEventListQuery = z.infer<typeof taskEventListQuery>;
