import { initContract } from "@ts-rest/core";
import {
  gdprExportResponse,
  gdprDeleteResponse,
  gdprCancelDeletionResponse,
  errorResponse,
} from "@valet/shared/schemas";

const c = initContract();

export const gdprContract = c.router({
  export: {
    method: "GET",
    path: "/api/v1/gdpr/export",
    responses: {
      200: gdprExportResponse,
      404: errorResponse,
    },
    summary: "Export all user data as JSON (GDPR Article 20)",
  },
  deleteAccount: {
    method: "DELETE",
    path: "/api/v1/gdpr/delete-account",
    body: null,
    responses: {
      200: gdprDeleteResponse,
      400: errorResponse,
      404: errorResponse,
    },
    summary: "Initiate account deletion with 30-day grace period",
  },
  cancelDeletion: {
    method: "POST",
    path: "/api/v1/gdpr/cancel-deletion",
    body: null,
    responses: {
      200: gdprCancelDeletionResponse,
      400: errorResponse,
      404: errorResponse,
    },
    summary: "Cancel pending account deletion",
  },
});
