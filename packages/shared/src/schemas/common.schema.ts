import { z } from "zod";

export const errorResponse = z.object({
  error: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});

export const uuidParam = z.object({
  id: z.string().uuid(),
});

// ─── Inferred Types ───
export type ErrorResponse = z.infer<typeof errorResponse>;
export type UuidParam = z.infer<typeof uuidParam>;
