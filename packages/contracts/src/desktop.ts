import { initContract } from "@ts-rest/core";
import { z } from "zod";
import {
  createHandoffRequest,
  createHandoffResponse,
  consumeHandoffResponse,
  desktopBootstrapResponse,
  errorResponse,
} from "@valet/shared/schemas";

const c = initContract();

export const desktopContract = c.router({
  createHandoff: {
    method: "POST",
    path: "/api/v1/desktop/handoffs",
    body: createHandoffRequest,
    responses: {
      201: createHandoffResponse,
      401: errorResponse,
    },
    summary: "Create a short-lived handoff token for web-to-desktop transfer",
  },
  consumeHandoff: {
    method: "POST",
    path: "/api/v1/desktop/handoffs/:token/consume",
    pathParams: z.object({ token: z.string() }),
    body: null,
    responses: {
      200: consumeHandoffResponse,
      404: errorResponse,
      401: errorResponse,
    },
    summary: "Exchange a handoff token for queued URLs and resume context",
  },
  bootstrap: {
    method: "GET",
    path: "/api/v1/desktop/bootstrap",
    responses: {
      200: desktopBootstrapResponse,
      401: errorResponse,
    },
    summary: "Get all state the desktop app needs in a single call",
  },
});
