import { z } from "zod";
import { paginationSchema } from "./task.schema.js";

// ─── Enums ───
export const notificationType = z.enum([
  "task_completed",
  "task_failed",
  "resume_parsed",
  "system",
]);

// ─── Base Entity ───
export const notificationSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  type: z.string(),
  title: z.string(),
  body: z.string(),
  read: z.boolean(),
  metadata: z.record(z.unknown()).nullable().optional(),
  createdAt: z.coerce.date(),
});

// ─── Request DTOs ───
export const notificationListQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  unreadOnly: z.coerce.boolean().default(false),
});

// ─── Response DTOs ───
export const notificationResponse = notificationSchema;

export const notificationListResponse = z.object({
  data: z.array(notificationResponse),
  pagination: paginationSchema,
  unreadCount: z.number(),
});

export const markReadResponse = z.object({
  success: z.boolean(),
});

// ─── Inferred Types ───
export type NotificationType = z.infer<typeof notificationType>;
export type Notification = z.infer<typeof notificationSchema>;
export type NotificationListQuery = z.infer<typeof notificationListQuery>;
export type NotificationListResponse = z.infer<typeof notificationListResponse>;
