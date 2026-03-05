import { initContract } from "@ts-rest/core";
import { z } from "zod";
import {
  platformCredentialResponse,
  platformCredentialListResponse,
  createPlatformCredentialBody,
  updatePlatformCredentialBody,
  mailboxCredentialResponse,
  mailboxCredentialListResponse,
  createMailboxCredentialBody,
  updateMailboxCredentialBody,
  credentialReadinessResponse,
  errorResponse,
} from "@valet/shared/schemas";

const c = initContract();

export const credentialContract = c.router({
  // ─── Platform Credentials ───
  listPlatformCredentials: {
    method: "GET",
    path: "/api/v1/credentials/platforms",
    responses: {
      200: platformCredentialListResponse,
    },
    summary: "List platform credentials for the current user",
  },
  createPlatformCredential: {
    method: "POST",
    path: "/api/v1/credentials/platforms",
    body: createPlatformCredentialBody,
    responses: {
      201: platformCredentialResponse,
      400: errorResponse,
      409: errorResponse,
    },
    summary: "Add a platform credential",
  },
  updatePlatformCredential: {
    method: "PATCH",
    path: "/api/v1/credentials/platforms/:id",
    pathParams: z.object({ id: z.string().uuid() }),
    body: updatePlatformCredentialBody,
    responses: {
      200: platformCredentialResponse,
      404: errorResponse,
    },
    summary: "Update a platform credential",
  },
  deletePlatformCredential: {
    method: "DELETE",
    path: "/api/v1/credentials/platforms/:id",
    pathParams: z.object({ id: z.string().uuid() }),
    responses: {
      204: z.void(),
      404: errorResponse,
    },
    summary: "Delete a platform credential",
  },

  // ─── Mailbox Credentials ───
  listMailboxCredentials: {
    method: "GET",
    path: "/api/v1/credentials/mailboxes",
    responses: {
      200: mailboxCredentialListResponse,
    },
    summary: "List mailbox credentials for the current user",
  },
  createMailboxCredential: {
    method: "POST",
    path: "/api/v1/credentials/mailboxes",
    body: createMailboxCredentialBody,
    responses: {
      201: mailboxCredentialResponse,
      400: errorResponse,
      409: errorResponse,
    },
    summary: "Add a mailbox credential",
  },
  updateMailboxCredential: {
    method: "PATCH",
    path: "/api/v1/credentials/mailboxes/:id",
    pathParams: z.object({ id: z.string().uuid() }),
    body: updateMailboxCredentialBody,
    responses: {
      200: mailboxCredentialResponse,
      404: errorResponse,
    },
    summary: "Update a mailbox credential",
  },
  deleteMailboxCredential: {
    method: "DELETE",
    path: "/api/v1/credentials/mailboxes/:id",
    pathParams: z.object({ id: z.string().uuid() }),
    responses: {
      204: z.void(),
      404: errorResponse,
    },
    summary: "Delete a mailbox credential",
  },

  // ─── Readiness ───
  checkReadiness: {
    method: "GET",
    path: "/api/v1/credentials/readiness",
    responses: {
      200: credentialReadinessResponse,
    },
    summary: "Check credential readiness across platforms",
  },
});
