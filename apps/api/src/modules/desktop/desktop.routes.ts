import { initServer } from "@ts-rest/fastify";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { desktopContract } from "@valet/contracts";

const s = initServer();

const S3_BUCKET = process.env.S3_BUCKET_RESUMES ?? "resumes";

export const desktopRouter = s.router(desktopContract, {
  createHandoff: async ({ request, body }) => {
    const { desktopService, launchDarklyService } = request.diScope.cradle;
    const allowed = await launchDarklyService.boolVariation(
      "valet.api.desktop_handoff_accept.enabled",
      launchDarklyService.buildUserContext({
        key: request.userId,
        email: request.userEmail,
        role: request.userRole,
        isAdmin: request.userRole === "admin" || request.userRole === "superadmin",
      }),
      true,
    );
    if (!allowed) {
      return {
        status: 403 as const,
        body: { error: "forbidden", message: "Desktop handoff is temporarily unavailable" },
      };
    }
    const result = await desktopService.createHandoff(request.userId, body);
    return { status: 201 as const, body: result };
  },
  consumeHandoff: async ({ request, params }) => {
    const { desktopService, launchDarklyService } = request.diScope.cradle;
    const allowed = await launchDarklyService.boolVariation(
      "valet.api.desktop_handoff_accept.enabled",
      launchDarklyService.buildUserContext({
        key: request.userId,
        email: request.userEmail,
        role: request.userRole,
        isAdmin: request.userRole === "admin" || request.userRole === "superadmin",
      }),
      true,
    );
    if (!allowed) {
      return {
        status: 403 as const,
        body: {
          error: "forbidden",
          message: "Desktop handoff acceptance is temporarily unavailable",
        },
      };
    }
    const data = await desktopService.consumeHandoff(params.token, request.userId);
    if (!data) {
      return {
        status: 404 as const,
        body: { error: "not_found", message: "Handoff token expired or already consumed" },
      };
    }
    return { status: 200 as const, body: data };
  },
  bootstrap: async ({ request }) => {
    const { desktopService, launchDarklyService } = request.diScope.cradle;
    const allowed = await launchDarklyService.boolVariation(
      "valet.api.desktop_bootstrap.enabled",
      launchDarklyService.buildUserContext({
        key: request.userId,
        email: request.userEmail,
        role: request.userRole,
        isAdmin: request.userRole === "admin" || request.userRole === "superadmin",
      }),
      true,
    );
    if (!allowed) {
      return {
        status: 403 as const,
        body: { error: "forbidden", message: "Desktop bootstrap is temporarily unavailable" },
      };
    }
    const userAgent = request.headers["user-agent"] ?? "";
    const data = await desktopService.bootstrap({
      userId: request.userId,
      email: request.userEmail,
      role: request.userRole,
      appVersion:
        typeof request.headers["x-desktop-app-version"] === "string"
          ? request.headers["x-desktop-app-version"]
          : null,
      platform:
        typeof request.headers["x-desktop-platform"] === "string"
          ? request.headers["x-desktop-platform"]
          : userAgent,
      arch:
        typeof request.headers["x-desktop-arch"] === "string"
          ? request.headers["x-desktop-arch"]
          : null,
    });
    return { status: 200 as const, body: data };
  },
});

/**
 * Standalone route for streaming resume file downloads from S3.
 * Registered outside ts-rest because it returns binary data, not JSON.
 */
export async function resumeDownloadRoute(fastify: FastifyInstance) {
  fastify.get(
    "/api/v1/resumes/:id/download",
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { resumeService, s3 } = request.diScope.cradle;
      const resume = await resumeService.getById(request.params.id, request.userId);
      const row = resume as Record<string, unknown>;

      const response = await s3.send(
        new GetObjectCommand({
          Bucket: S3_BUCKET,
          Key: row.fileKey as string,
        }),
      );

      const body = response.Body;
      if (!body) {
        return reply
          .status(404)
          .send({ error: "not_found", message: "Resume file not found in storage" });
      }

      const filename = row.filename as string;
      const mimeType = (row.mimeType as string) || "application/octet-stream";

      reply.header("Content-Type", mimeType);
      reply.header(
        "Content-Disposition",
        `attachment; filename="${filename.replace(/"/g, '\\"')}"`,
      );
      if (response.ContentLength) {
        reply.header("Content-Length", response.ContentLength);
      }

      return reply.send(body);
    },
  );
}
