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
