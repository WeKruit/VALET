import { initContract } from "@ts-rest/core";
import {
  creditBalanceResponse,
  creditLedgerResponse,
  creditLedgerQuery,
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
});
