import { initContract } from "@ts-rest/core";
import {
  earlyAccessSubmitRequest,
  earlyAccessSubmitResponse,
  errorResponse,
} from "@valet/shared/schemas";

const c = initContract();

export const earlyAccessContract = c.router({
  submit: {
    method: "POST",
    path: "/api/v1/early-access",
    body: earlyAccessSubmitRequest,
    responses: {
      201: earlyAccessSubmitResponse,
      400: errorResponse,
      409: errorResponse,
    },
    summary: "Submit early access / waitlist signup",
  },
});
