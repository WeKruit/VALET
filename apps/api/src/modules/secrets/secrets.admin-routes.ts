import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { adminOnly } from "../../common/middleware/admin.js";

export async function secretsAdminRoutes(fastify: FastifyInstance) {
  // GET /api/v1/admin/secrets/diff?env=staging
  fastify.get(
    "/api/v1/admin/secrets/diff",
    async (request: FastifyRequest<{ Querystring: { env?: string } }>, reply: FastifyReply) => {
      await adminOnly(request);
      const env = (request.query.env ?? "staging") as "staging" | "production";
      if (env !== "staging" && env !== "production") {
        return reply.status(400).send({ error: "env must be 'staging' or 'production'" });
      }
      const { secretsSyncService } = request.diScope.cradle;
      try {
        const diff = await secretsSyncService.getDiff(env);
        return reply.send(diff);
      } catch (err) {
        request.log.error({ err }, "Secrets diff failed");
        return reply.status(500).send({ error: "Failed to compute secrets diff" });
      }
    },
  );

  // POST /api/v1/admin/secrets/sync
  fastify.post(
    "/api/v1/admin/secrets/sync",
    async (
      request: FastifyRequest<{
        Body: { env: string; targets?: string[] };
      }>,
      reply: FastifyReply,
    ) => {
      await adminOnly(request);
      const body = (request.body as { env?: string; targets?: string[] }) ?? {};
      const env = body.env as "staging" | "production";
      if (env !== "staging" && env !== "production") {
        return reply.status(400).send({ error: "env must be 'staging' or 'production'" });
      }
      const { secretsSyncService } = request.diScope.cradle;
      try {
        const result = await secretsSyncService.sync(
          env,
          request.userId ?? "unknown",
          body.targets,
        );
        return reply.send(result);
      } catch (err) {
        request.log.error({ err }, "Secrets sync failed");
        return reply.status(500).send({ error: "Failed to sync secrets" });
      }
    },
  );
}
