import { z } from "zod";

export const consentType = z.enum([
  "tos_acceptance",
  "privacy_policy",
  "copilot_disclaimer",
  "autopilot_consent",
]);

export const consentRecordSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  type: consentType,
  version: z.string(),
  ipAddress: z.string(),
  userAgent: z.string(),
  createdAt: z.coerce.date(),
});

export const createConsentRequest = z.object({
  type: consentType,
  version: z.string().min(1),
  ipAddress: z.string().optional(),
  userAgent: z.string().optional(),
});

export const consentCheckQuery = z.object({
  type: consentType,
  version: z.string().min(1),
});

export const consentCheckResponse = z.object({
  accepted: z.boolean(),
  acceptedAt: z.coerce.date().nullable(),
});

export const consentRecordResponse = consentRecordSchema;

export const consentListResponse = z.object({
  data: z.array(consentRecordResponse),
});

// ─── Inferred Types ───
export type ConsentType = z.infer<typeof consentType>;
export type ConsentRecord = z.infer<typeof consentRecordSchema>;
export type CreateConsentRequest = z.infer<typeof createConsentRequest>;
export type ConsentCheckQuery = z.infer<typeof consentCheckQuery>;
export type ConsentCheckResponse = z.infer<typeof consentCheckResponse>;
export type ConsentRecordResponse = z.infer<typeof consentRecordResponse>;
export type ConsentListResponse = z.infer<typeof consentListResponse>;
