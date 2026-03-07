import { initContract } from "@ts-rest/core";
import {
  creditBalanceResponse,
  creditLedgerResponse,
  creditLedgerQuery,
  costConfigResponse,
  consumeCreditsRequest,
  consumeCreditsResponse,
  adminGrantCreditsRequest,
  adminGrantCreditsResponse,
  errorResponse,
} from "@valet/shared/schemas";

const c = initContract();

export const creditContract = c.router({
  getBalance: {
    method: "GET",
    path: "/api/v1/credits/balance",
    responses: {
      200: creditBalanceResponse,
    },
    summary: "Get current user credit balance",
  },
  getLedger: {
    method: "GET",
    path: "/api/v1/credits/ledger",
    query: creditLedgerQuery,
    responses: {
      200: creditLedgerResponse,
    },
    summary: "Get current user credit transaction history",
  },
  getCostConfig: {
    method: "GET",
    path: "/api/v1/credits/cost-config",
    responses: {
      200: costConfigResponse,
    },
    summary: "Get credit cost configuration for all operation types",
  },
  consume: {
    method: "POST",
    path: "/api/v1/credits/consume",
    body: consumeCreditsRequest,
    responses: {
      200: consumeCreditsResponse,
      402: errorResponse,
    },
    summary: "Consume credits for a given cost type (unified cost endpoint)",
  },
  adminGrant: {
    method: "POST",
    path: "/api/v1/credits/admin/grant",
    body: adminGrantCreditsRequest,
    responses: {
      200: adminGrantCreditsResponse,
      403: errorResponse,
    },
    summary: "Admin: grant or adjust credits for a user",
  },
});
