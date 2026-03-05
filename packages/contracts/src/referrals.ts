import { initContract } from "@ts-rest/core";
import {
  referralStatsResponse,
  claimReferralRequest,
  claimReferralResponse,
  errorResponse,
} from "@valet/shared/schemas";

const c = initContract();

export const referralContract = c.router({
  getMyReferral: {
    method: "GET",
    path: "/api/v1/referrals/me",
    responses: {
      200: referralStatsResponse,
    },
    summary: "Get current user referral code and stats",
  },
  claim: {
    method: "POST",
    path: "/api/v1/referrals/claim",
    body: claimReferralRequest,
    responses: {
      200: claimReferralResponse,
      400: errorResponse,
      409: errorResponse,
    },
    summary: "Claim a referral code (link referred user to referrer)",
  },
});
