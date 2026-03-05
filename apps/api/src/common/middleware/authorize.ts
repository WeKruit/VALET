import type { FastifyRequest } from "fastify";
import type { Actions, Subjects } from "@valet/shared/auth";
import { AppError } from "../errors.js";

export function requireAbility(action: Actions, subject: Subjects) {
  return async (request: FastifyRequest) => {
    if (!request.ability || request.ability.cannot(action, subject)) {
      request.log.warn(
        { userRole: request.userRole, action, subject, userId: request.userId },
        "CASL authorization denied",
      );
      throw AppError.forbidden(
        "Your account is on the early access waitlist. We'll notify you when access is ready.",
      );
    }
  };
}
