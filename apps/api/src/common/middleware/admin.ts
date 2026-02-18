import type { FastifyRequest } from "fastify";
import { AppError } from "../errors.js";

/** Restricts access to admin and superadmin roles. Can be called from ts-rest handlers. */
export async function adminOnly(
  request: FastifyRequest,
): Promise<void> {
  const role = request.userRole;
  if (role !== "admin" && role !== "superadmin") {
    throw AppError.forbidden("Admin access required");
  }
}
