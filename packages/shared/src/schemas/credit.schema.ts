import { z } from "zod";

export const creditBalanceResponse = z.object({
  balance: z.number(),
  trialExpiry: z.string().nullable(),
  enforcementEnabled: z.boolean(),
});

export const creditLedgerEntry = z.object({
  id: z.string().uuid(),
  delta: z.number(),
  balanceAfter: z.number(),
  reason: z.string(),
  description: z.string().nullable(),
  referenceType: z.string().nullable(),
  referenceId: z.string().uuid().nullable(),
  createdAt: z.coerce.date(),
});

export const creditLedgerResponse = z.object({
  entries: z.array(creditLedgerEntry),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});

export const creditLedgerQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

// ─── Cost types ───
export const creditCostType = z.enum([
  "task_application",
  "batch_application",
  "premium_analysis",
  "resume_optimization",
  "cover_letter",
]);
export type CreditCostType = z.infer<typeof creditCostType>;

// ─── Cost config response ───
export const costConfigEntry = z.object({
  costType: creditCostType,
  credits: z.number(),
  label: z.string(),
  description: z.string(),
});

export const costConfigResponse = z.object({
  costs: z.array(costConfigEntry),
});

// ─── Consume credits request/response ───
export const consumeCreditsRequest = z.object({
  costType: creditCostType,
  referenceType: z.string().max(30).optional(),
  referenceId: z.string().uuid().optional(),
  description: z.string().max(500).optional(),
  idempotencyKey: z.string().max(100).optional(),
});

export const consumeCreditsResponse = z.object({
  success: z.boolean(),
  balance: z.number(),
  creditsUsed: z.number(),
  message: z.string().optional(),
});

// ─── Admin grant request/response ───
export const adminGrantCreditsRequest = z.object({
  userId: z.string().uuid(),
  amount: z.number().int().min(1),
  reason: z.string().min(1).max(30),
  description: z.string().max(500).optional(),
});

export const adminGrantCreditsResponse = z.object({
  balance: z.number(),
  message: z.string(),
});
