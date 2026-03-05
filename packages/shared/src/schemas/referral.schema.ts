import { z } from "zod";

export const referralStatsResponse = z.object({
  code: z.string(),
  totalReferred: z.number(),
  pendingCount: z.number(),
  activatedCount: z.number(),
  rewardedCount: z.number(),
});

export const claimReferralRequest = z.object({
  referralCode: z.string().min(1).max(20),
});

export const claimReferralResponse = z.object({
  message: z.string(),
  claimed: z.boolean(),
});
