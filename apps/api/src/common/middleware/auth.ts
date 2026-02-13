import type { FastifyRequest, FastifyReply } from "fastify";
import * as jose from "jose";
import { AppError } from "../errors.js";

declare module "fastify" {
  interface FastifyRequest {
    userId: string;
    userEmail: string;
  }
}

const PUBLIC_PATHS = [
  "/api/v1/auth/google",
  "/api/v1/auth/refresh",
  "/api/v1/health",
  "/api/v1/ws",
  "/docs",
];

export async function authMiddleware(
  request: FastifyRequest,
  _reply: FastifyReply,
) {
  const path = request.url.split("?")[0];
  if (!path) return;

  if (PUBLIC_PATHS.some((p) => path.startsWith(p))) {
    return;
  }

  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    throw AppError.unauthorized("Missing or invalid authorization header");
  }

  const token = authHeader.slice(7);
  try {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw AppError.unauthorized("Server configuration error");
    }
    const secret = new TextEncoder().encode(jwtSecret);
    const { payload } = await jose.jwtVerify(token, secret, {
      algorithms: ["HS256"],
    });

    if (!payload.sub || !payload.email) {
      throw AppError.unauthorized("Invalid token payload");
    }

    request.userId = payload.sub;
    request.userEmail = payload.email as string;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw AppError.unauthorized("Invalid or expired token");
  }
}
