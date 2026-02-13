import { initContract } from "@ts-rest/core";
import {
  createConsentRequest,
  consentCheckQuery,
  consentCheckResponse,
  consentRecordResponse,
  consentListResponse,
  errorResponse,
} from "@valet/shared/schemas";

const c = initContract();

export const consentContract = c.router({
  list: {
    method: "GET",
    path: "/api/v1/consent",
    responses: {
      200: consentListResponse,
    },
    summary: "List all consent records for the current user",
  },
  create: {
    method: "POST",
    path: "/api/v1/consent",
    body: createConsentRequest,
    responses: {
      201: consentRecordResponse,
      400: errorResponse,
    },
    summary: "Record a new consent acceptance",
  },
  check: {
    method: "GET",
    path: "/api/v1/consent/check",
    query: consentCheckQuery,
    responses: {
      200: consentCheckResponse,
    },
    summary: "Check if user has accepted a specific consent type and version",
  },
});
