import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { adminOnly } from "../../common/middleware/admin.js";

export async function syncAdminRoutes(fastify: FastifyInstance) {
  // GET /api/v1/admin/sync/instances — Diff view: ASG vs DB
  fastify.get(
    "/api/v1/admin/sync/instances",
    async (request: FastifyRequest, reply: FastifyReply) => {
      await adminOnly(request);
      const { instanceDiscoveryService } = request.diScope.cradle;

      const diff = await instanceDiscoveryService.getDiff();

      return reply.send({
        newInstances: diff.newInstances,
        staleRecords: diff.staleRecords.map((s) => ({
          id: s.id,
          name: s.name,
          instanceId: s.instanceId,
          publicIp: s.publicIp,
          status: s.status,
          healthStatus: s.healthStatus,
        })),
        matched: diff.matched.map((m) => ({
          instanceId: m.instance.instanceId,
          publicIp: m.instance.publicIp,
          sandboxId: m.sandbox.id,
          sandboxName: m.sandbox.name,
          sandboxIp: m.sandbox.publicIp,
          ipChanged: m.ipChanged,
        })),
        summary: {
          asgCount: diff.asgInstances.length,
          dbCount: diff.dbSandboxes.length,
          newCount: diff.newInstances.length,
          staleCount: diff.staleRecords.length,
          matchedCount: diff.matched.length,
          ipChanges: diff.matched.filter((m) => m.ipChanged).length,
        },
      });
    },
  );

  // POST /api/v1/admin/sync/reconcile — Force reconciliation now
  fastify.post(
    "/api/v1/admin/sync/reconcile",
    async (request: FastifyRequest, reply: FastifyReply) => {
      await adminOnly(request);
      const { instanceDiscoveryService } = request.diScope.cradle;

      const result = await instanceDiscoveryService.reconcile();

      return reply.send(result);
    },
  );
}
