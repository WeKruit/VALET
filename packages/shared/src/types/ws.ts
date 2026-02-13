import { z } from "zod";

export const wsMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("state_change"),
    taskId: z.string().uuid(),
    from: z.string(),
    to: z.string(),
    timestamp: z.string().datetime(),
  }),
  z.object({
    type: z.literal("progress"),
    taskId: z.string().uuid(),
    step: z.string(),
    pct: z.number().min(0).max(100),
    message: z.string(),
  }),
  z.object({
    type: z.literal("field_review"),
    taskId: z.string().uuid(),
    fields: z.array(
      z.object({
        name: z.string(),
        value: z.string(),
        confidence: z.number().min(0).max(1),
        source: z.enum(["resume", "qa_bank", "llm_generated"]),
      }),
    ),
  }),
  z.object({
    type: z.literal("human_needed"),
    taskId: z.string().uuid(),
    reason: z.string(),
    vncUrl: z.string().url().optional(),
  }),
  z.object({
    type: z.literal("completed"),
    taskId: z.string().uuid(),
    confirmationId: z.string().optional(),
    screenshotUrl: z.string().url().optional(),
  }),
  z.object({
    type: z.literal("error"),
    taskId: z.string().uuid(),
    code: z.string(),
    message: z.string(),
    recoverable: z.boolean(),
  }),
]);

export type WSMessage = z.infer<typeof wsMessageSchema>;
