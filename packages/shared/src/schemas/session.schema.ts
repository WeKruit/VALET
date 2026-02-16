import { z } from "zod";

// ─── Base Entity ───
export const browserSessionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  domain: z.string(),
  createdAt: z.coerce.date(),
  lastUsedAt: z.coerce.date().nullable(),
  expiresAt: z.coerce.date().nullable().optional(),
});

// ─── Response DTOs ───
export const sessionListResponse = z.object({
  sessions: z.array(browserSessionSchema),
  count: z.number().int(),
});

export const sessionDeleteResponse = z.object({
  domain: z.string(),
  deleted: z.literal(true),
});

export const sessionClearAllResponse = z.object({
  deletedCount: z.number().int(),
});

// ─── Inferred Types (NEVER hand-write these) ───
export type BrowserSession = z.infer<typeof browserSessionSchema>;
export type SessionListResponse = z.infer<typeof sessionListResponse>;
export type SessionDeleteResponse = z.infer<typeof sessionDeleteResponse>;
export type SessionClearAllResponse = z.infer<typeof sessionClearAllResponse>;
