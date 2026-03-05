import { initServer } from "@ts-rest/fastify";
import { referralContract } from "@valet/contracts";

const s = initServer();

export const referralRouter = s.router(referralContract, {
  getMyReferral: async ({ request }) => {
    if (process.env.FEATURE_REFERRALS !== "true") {
      return {
        status: 200 as const,
        body: { code: "", totalReferred: 0, pendingCount: 0, activatedCount: 0, rewardedCount: 0 },
      };
    }
    const { referralService } = request.diScope.cradle;
    const stats = await referralService.getStats(request.userId);
    return { status: 200 as const, body: stats };
  },
  claim: async ({ request, body }) => {
    if (process.env.FEATURE_REFERRALS !== "true") {
      return { status: 200 as const, body: { claimed: false, message: "Referrals not enabled" } };
    }
    const { referralService } = request.diScope.cradle;
    const result = await referralService.claimReferral(request.userId, body.referralCode);
    if (!result.claimed && result.message === "Invalid referral code") {
      return {
        status: 400 as const,
        body: { error: "BAD_REQUEST", message: result.message },
      };
    }
    return { status: 200 as const, body: result };
  },
});
