import { initServer } from "@ts-rest/fastify";
import { referralContract } from "@valet/contracts";

const s = initServer();

export const referralRouter = s.router(referralContract, {
  getMyReferral: async ({ request }) => {
    const { referralService } = request.diScope.cradle;
    const stats = await referralService.getStats(request.userId);
    return { status: 200 as const, body: stats };
  },
  claim: async ({ request, body }) => {
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
