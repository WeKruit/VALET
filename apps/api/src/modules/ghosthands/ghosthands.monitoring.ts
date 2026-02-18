import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { adminOnly } from "../../common/middleware/admin.js";

export async function ghosthandsMonitoringRoutes(fastify: FastifyInstance) {
  // Proxy GH /monitoring/health
  fastify.get(
    "/api/v1/admin/monitoring/health",
    async (request: FastifyRequest, reply: FastifyReply) => {
      await adminOnly(request);
      const { ghosthandsClient } = request.diScope.cradle;
      try {
        const data = await ghosthandsClient.getDetailedHealth();
        return reply.send(data);
      } catch (err) {
        request.log.error({ err }, "Failed to fetch GH health");
        return reply.status(502).send({ error: "GhostHands API unreachable" });
      }
    },
  );

  // Proxy GH /monitoring/metrics/json
  fastify.get(
    "/api/v1/admin/monitoring/metrics",
    async (request: FastifyRequest, reply: FastifyReply) => {
      await adminOnly(request);
      const { ghosthandsClient } = request.diScope.cradle;
      try {
        const data = await ghosthandsClient.getMetrics();
        return reply.send(data);
      } catch (err) {
        request.log.error({ err }, "Failed to fetch GH metrics");
        return reply.status(502).send({ error: "GhostHands API unreachable" });
      }
    },
  );

  // Proxy GH /monitoring/alerts
  fastify.get(
    "/api/v1/admin/monitoring/alerts",
    async (request: FastifyRequest, reply: FastifyReply) => {
      await adminOnly(request);
      const { ghosthandsClient } = request.diScope.cradle;
      try {
        const data = await ghosthandsClient.getAlerts();
        return reply.send(data);
      } catch (err) {
        request.log.error({ err }, "Failed to fetch GH alerts");
        return reply
          .status(502)
          .send({ error: "GhostHands API unreachable", alerts: [], count: 0 });
      }
    },
  );
}
