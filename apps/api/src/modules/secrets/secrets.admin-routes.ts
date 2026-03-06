import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { AppError } from "../../common/errors.js";
import { adminOnly } from "../../common/middleware/admin.js";
import { SANDBOX_AGENT_PORT } from "../sandboxes/agent/sandbox-agent.client.js";

function getAtmSecretsBaseUrl(): string {
  const baseUrl = process.env.ATM_BASE_URL ?? process.env.ATM_HOST;
  if (!baseUrl) {
    throw new Error("ATM_BASE_URL or ATM_HOST is required to proxy canonical secrets writes");
  }
  return baseUrl.replace(/\/$/, "");
}

function getAtmDeploySecret(): string {
  const secret = process.env.ATM_DEPLOY_SECRET ?? process.env.GH_DEPLOY_SECRET;
  if (!secret) {
    throw new Error(
      "ATM_DEPLOY_SECRET or GH_DEPLOY_SECRET is required to proxy canonical secrets writes",
    );
  }
  return secret;
}

async function proxyCanonicalSecrets<T>(path: string, init?: globalThis.RequestInit): Promise<T> {
  const response = await fetch(`${getAtmSecretsBaseUrl()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Deploy-Secret": getAtmDeploySecret(),
      ...(init?.headers as Record<string, string> | undefined),
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`ATM canonical secrets proxy failed (${response.status}): ${body}`);
  }

  return (await response.json()) as T;
}

export async function secretsAdminRoutes(fastify: FastifyInstance) {
  // GET /api/v1/admin/secrets/diff?env=staging
  fastify.get(
    "/api/v1/admin/secrets/diff",
    async (request: FastifyRequest<{ Querystring: { env?: string } }>, reply: FastifyReply) => {
      try {
        await adminOnly(request);
        const env = (request.query.env ?? "staging") as "staging" | "production";
        if (env !== "staging" && env !== "production") {
          return reply.status(400).send({ error: "env must be 'staging' or 'production'" });
        }
        const { secretsSyncService } = request.diScope.cradle;
        const diff = await secretsSyncService.getDiff(env);
        return reply.send(diff);
      } catch (err) {
        if (err instanceof AppError) throw err;
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
      try {
        await adminOnly(request);
        const body = (request.body as { env?: string; targets?: string[] }) ?? {};
        const env = body.env as "staging" | "production";
        if (env !== "staging" && env !== "production") {
          return reply.status(400).send({ error: "env must be 'staging' or 'production'" });
        }
        const { secretsSyncService } = request.diScope.cradle;
        const result = await secretsSyncService.sync(
          env,
          request.userId ?? "unknown",
          body.targets,
        );
        return reply.send(result);
      } catch (err) {
        if (err instanceof AppError) throw err;
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
      try {
        await adminOnly(request);
        const env = request.query.env;
        if (env && env !== "staging" && env !== "production") {
          return reply.status(400).send({ error: "env must be 'staging' or 'production'" });
        }
        const limit = Math.min(parseInt(request.query.limit ?? "50", 10) || 50, 200);
        const { secretsSyncService } = request.diScope.cradle;
        const entries = await secretsSyncService.getAuditLog(env, limit);
        return reply.send({ entries });
      } catch (err) {
        if (err instanceof AppError) throw err;
        request.log.error({ err }, "Secrets audit log query failed");
        return reply.status(500).send({ error: "Failed to fetch audit log" });
      }
    },
  );

  // GET /api/v1/admin/secrets/vars?env=staging&project=valet
  fastify.get(
    "/api/v1/admin/secrets/vars",
    async (
      request: FastifyRequest<{ Querystring: { env?: string; project?: string } }>,
      reply: FastifyReply,
    ) => {
      try {
        await adminOnly(request);
        const env = request.query.env as "staging" | "production" | undefined;
        if (!env || (env !== "staging" && env !== "production")) {
          return reply.status(400).send({ error: "env must be 'staging' or 'production'" });
        }
        const project = request.query.project as "valet" | "ghosthands" | undefined;
        if (!project || (project !== "valet" && project !== "ghosthands")) {
          return reply.status(400).send({ error: "project must be 'valet' or 'ghosthands'" });
        }
        const params = new URLSearchParams({
          app: project,
          environment: env,
        });
        const result = await proxyCanonicalSecrets(`/admin/secrets/vars?${params.toString()}`);
        return reply.send(result);
      } catch (err) {
        if (err instanceof AppError) throw err;
        request.log.error({ err }, "List secret vars failed");
        return reply.status(500).send({ error: "Failed to list secret vars" });
      }
    },
  );

  // PUT /api/v1/admin/secrets/vars
  fastify.put(
    "/api/v1/admin/secrets/vars",
    async (
      request: FastifyRequest<{
        Body: {
          env: string;
          project: string;
          vars: Array<{ key: string; value: string }>;
        };
      }>,
      reply: FastifyReply,
    ) => {
      try {
        await adminOnly(request);
        const body =
          (request.body as {
            env?: string;
            project?: string;
            vars?: Array<{ key: string; value: string }>;
          }) ?? {};
        const env = body.env as "staging" | "production";
        if (env !== "staging" && env !== "production") {
          return reply.status(400).send({ error: "env must be 'staging' or 'production'" });
        }
        const project = body.project as "valet" | "ghosthands";
        if (project !== "valet" && project !== "ghosthands") {
          return reply.status(400).send({ error: "project must be 'valet' or 'ghosthands'" });
        }
        if (!Array.isArray(body.vars) || body.vars.length === 0) {
          return reply
            .status(400)
            .send({ error: "vars must be a non-empty array of { key, value }" });
        }
        const result = await proxyCanonicalSecrets(`/admin/secrets/vars`, {
          method: "PUT",
          body: JSON.stringify({
            app: project,
            environment: env,
            vars: body.vars,
          }),
        });
        return reply.send(result);
      } catch (err) {
        if (err instanceof AppError) throw err;
        if (
          err instanceof Error &&
          (err.message.includes("runtime-injected") || err.message.includes("Invalid key format"))
        ) {
          return reply.status(400).send({ error: err.message });
        }
        request.log.error({ err }, "Upsert secret vars failed");
        return reply.status(500).send({ error: "Failed to upsert secret vars" });
      }
    },
  );

  // DELETE /api/v1/admin/secrets/vars
  fastify.delete(
    "/api/v1/admin/secrets/vars",
    async (
      request: FastifyRequest<{
        Body: { env: string; project: string; keys: string[] };
      }>,
      reply: FastifyReply,
    ) => {
      try {
        await adminOnly(request);
        const body =
          (request.body as {
            env?: string;
            project?: string;
            keys?: string[];
          }) ?? {};
        const env = body.env as "staging" | "production";
        if (env !== "staging" && env !== "production") {
          return reply.status(400).send({ error: "env must be 'staging' or 'production'" });
        }
        const project = body.project as "valet" | "ghosthands";
        if (project !== "valet" && project !== "ghosthands") {
          return reply.status(400).send({ error: "project must be 'valet' or 'ghosthands'" });
        }
        if (!Array.isArray(body.keys) || body.keys.length === 0) {
          return reply.status(400).send({ error: "keys must be a non-empty array" });
        }
        const result = await proxyCanonicalSecrets(`/admin/secrets/vars`, {
          method: "DELETE",
          body: JSON.stringify({
            app: project,
            environment: env,
            keys: body.keys,
          }),
        });
        return reply.send(result);
      } catch (err) {
        if (err instanceof AppError) throw err;
        request.log.error({ err }, "Delete secret vars failed");
        return reply.status(500).send({ error: "Failed to delete secret vars" });
      }
    },
  );

  // POST /api/v1/admin/secrets/refresh-fleet
  fastify.post(
    "/api/v1/admin/secrets/refresh-fleet",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        await adminOnly(request);
        const { sandboxRepo, sandboxAgentClient } = request.diScope.cradle;
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
            const agentUrl = `http://${sb.publicIp}:${SANDBOX_AGENT_PORT}`;
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
        if (err instanceof AppError) throw err;
        request.log.error({ err }, "Fleet refresh failed");
        return reply.status(500).send({ error: "Failed to refresh fleet secrets" });
      }
    },
  );

  // POST /api/v1/admin/secrets/refresh-sandbox/:sandboxId
  fastify.post(
    "/api/v1/admin/secrets/refresh-sandbox/:sandboxId",
    async (request: FastifyRequest<{ Params: { sandboxId: string } }>, reply: FastifyReply) => {
      try {
        await adminOnly(request);
        const { sandboxId } = request.params;
        const { sandboxRepo, sandboxAgentClient } = request.diScope.cradle;
        const sandbox = await sandboxRepo.findById(sandboxId);
        if (!sandbox) {
          return reply.status(404).send({ error: "Sandbox not found" });
        }
        if (!sandbox.publicIp) {
          return reply.status(400).send({ error: "Sandbox has no public IP" });
        }

        const agentUrl = `http://${sandbox.publicIp}:${SANDBOX_AGENT_PORT}`;
        const result = await sandboxAgentClient.refreshSecrets(agentUrl);

        return reply.send({
          sandboxId: sandbox.id,
          name: sandbox.name,
          ip: sandbox.publicIp,
          success: result.success,
          message: result.message,
        });
      } catch (err) {
        if (err instanceof AppError) throw err;
        request.log.error({ err, sandboxId: request.params }, "Sandbox refresh failed");
        return reply.status(500).send({ error: "Failed to refresh sandbox secrets" });
      }
    },
  );
}
