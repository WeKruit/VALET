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

  // GET /api/v1/admin/secrets/audit?env=staging&limit=50
  fastify.get(
    "/api/v1/admin/secrets/audit",
    async (
      request: FastifyRequest<{ Querystring: { env?: string; limit?: string } }>,
      reply: FastifyReply,
    ) => {
      await adminOnly(request);
      const env = request.query.env;
      if (env && env !== "staging" && env !== "production") {
        return reply.status(400).send({ error: "env must be 'staging' or 'production'" });
      }
      const limit = Math.min(parseInt(request.query.limit ?? "50", 10) || 50, 200);
      const { secretsSyncService } = request.diScope.cradle;
      try {
        const entries = await secretsSyncService.getAuditLog(env, limit);
        return reply.send({ entries });
      } catch (err) {
        request.log.error({ err }, "Secrets audit log query failed");
        return reply.status(500).send({ error: "Failed to fetch audit log" });
      }
    },
  );

  // POST /api/v1/admin/secrets/refresh-fleet
  fastify.post(
    "/api/v1/admin/secrets/refresh-fleet",
    async (request: FastifyRequest, reply: FastifyReply) => {
      await adminOnly(request);
      const { sandboxRepo, sandboxAgentClient } = request.diScope.cradle;
      try {
        const sandboxes = await sandboxRepo.findActive("ec2");
        if (sandboxes.length === 0) {
          return reply.send({
            refreshed: [],
            failed: [],
            skipped: [],
          });
        }

        const results = await Promise.allSettled(
          sandboxes.map(async (sb) => {
            if (!sb.publicIp) {
              return {
                sandboxId: sb.id,
                name: sb.name,
                ip: null,
                status: "skipped" as const,
                reason: "No public IP",
              };
            }
            const agentUrl = `http://${sb.publicIp}:8000`;
            const result = await sandboxAgentClient.refreshSecrets(agentUrl);
            return {
              sandboxId: sb.id,
              name: sb.name,
              ip: sb.publicIp,
              status: result.success ? ("ok" as const) : ("error" as const),
              error: result.success ? undefined : result.message,
            };
          }),
        );

        const refreshed: Array<{
          sandboxId: string;
          name: string;
          ip: string | null;
          status: string;
        }> = [];
        const failed: Array<{ sandboxId: string; name: string; ip: string | null; error: string }> =
          [];
        const skipped: Array<{ sandboxId: string; name: string; reason: string }> = [];

        for (const r of results) {
          if (r.status === "rejected") {
            failed.push({
              sandboxId: "unknown",
              name: "unknown",
              ip: null,
              error: String(r.reason),
            });
            continue;
          }
          const val = r.value;
          if (val.status === "skipped") {
            skipped.push({
              sandboxId: val.sandboxId,
              name: val.name,
              reason: val.reason ?? "Unknown",
            });
          } else if (val.status === "ok") {
            refreshed.push({ sandboxId: val.sandboxId, name: val.name, ip: val.ip, status: "ok" });
          } else {
            failed.push({
              sandboxId: val.sandboxId,
              name: val.name,
              ip: val.ip,
              error: val.error ?? "Unknown error",
            });
          }
        }

        return reply.send({ refreshed, failed, skipped });
      } catch (err) {
        request.log.error({ err }, "Fleet refresh failed");
        return reply.status(500).send({ error: "Failed to refresh fleet secrets" });
      }
    },
  );

  // POST /api/v1/admin/secrets/refresh-sandbox/:sandboxId
  fastify.post(
    "/api/v1/admin/secrets/refresh-sandbox/:sandboxId",
    async (request: FastifyRequest<{ Params: { sandboxId: string } }>, reply: FastifyReply) => {
      await adminOnly(request);
      const { sandboxId } = request.params;
      const { sandboxRepo, sandboxAgentClient } = request.diScope.cradle;
      try {
        const sandbox = await sandboxRepo.findById(sandboxId);
        if (!sandbox) {
          return reply.status(404).send({ error: "Sandbox not found" });
        }
        if (!sandbox.publicIp) {
          return reply.status(400).send({ error: "Sandbox has no public IP" });
        }

        const agentUrl = `http://${sandbox.publicIp}:8000`;
        const result = await sandboxAgentClient.refreshSecrets(agentUrl);

        return reply.send({
          sandboxId: sandbox.id,
          name: sandbox.name,
          ip: sandbox.publicIp,
          success: result.success,
          message: result.message,
        });
      } catch (err) {
        request.log.error({ err, sandboxId }, "Sandbox refresh failed");
        return reply.status(500).send({ error: "Failed to refresh sandbox secrets" });
      }
    },
  );
}
