import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { adminOnly } from "../../common/middleware/admin.js";

function enrichWorker(
  w: {
    worker_id: string;
    target_worker_id?: string | null;
    status: string;
    current_job_id: string | null;
    registered_at: string;
    last_heartbeat: string;
    jobs_completed: number;
    jobs_failed: number;
    uptime_seconds?: number | null;
  },
  sandboxMap: Map<string, { id: string; name: string; environment: string }>,
) {
  const sandbox = sandboxMap.get(w.worker_id) ?? sandboxMap.get(w.target_worker_id ?? "");
  return {
    worker_id: w.worker_id,
    sandbox_id: sandbox?.id ?? null,
    sandbox_name: sandbox?.name ?? null,
    environment: sandbox?.environment ?? null,
    status: w.status,
    current_job_id: w.current_job_id,
    registered_at: w.registered_at,
    last_heartbeat: w.last_heartbeat,
    jobs_completed: w.jobs_completed,
    jobs_failed: w.jobs_failed,
    uptime_seconds: w.uptime_seconds ?? null,
  };
}

export async function workerAdminRoutes(fastify: FastifyInstance) {
  fastify.get("/api/v1/admin/workers", async (request: FastifyRequest, reply: FastifyReply) => {
    await adminOnly(request);
    const { ghosthandsClient, sandboxRepo } = request.diScope.cradle;
    try {
      const [fleetData, activeSandboxes] = await Promise.all([
        ghosthandsClient.getWorkerFleet(),
        sandboxRepo.findAllActive(),
      ]);
      const sandboxMap = new Map(activeSandboxes.map((s) => [s.id, s]));
      const workers = fleetData.workers.map((w) => enrichWorker(w, sandboxMap));
      return reply.send({ workers, total: workers.length });
    } catch (err) {
      request.log.error({ err }, "Failed to fetch worker fleet");
      return reply.status(502).send({ error: "GhostHands API unreachable" });
    }
  });

  fastify.get(
    "/api/v1/admin/workers/:workerId",
    async (request: FastifyRequest<{ Params: { workerId: string } }>, reply: FastifyReply) => {
      await adminOnly(request);
      const { ghosthandsClient, sandboxRepo } = request.diScope.cradle;
      const { workerId } = request.params;
      try {
        const [fleetData, activeSandboxes] = await Promise.all([
          ghosthandsClient.getWorkerFleet(),
          sandboxRepo.findAllActive(),
        ]);
        const worker = fleetData.workers.find((w) => w.worker_id === workerId);
        if (!worker) return reply.status(404).send({ error: "Worker not found" });
        const sandboxMap = new Map(activeSandboxes.map((s) => [s.id, s]));
        return reply.send(enrichWorker(worker, sandboxMap));
      } catch (err) {
        request.log.error({ err }, "Failed to fetch worker detail");
        return reply.status(502).send({ error: "GhostHands API unreachable" });
      }
    },
  );

  fastify.post(
    "/api/v1/admin/workers/:workerId/deregister",
    async (
      request: FastifyRequest<{
        Params: { workerId: string };
        Body: { reason: string; cancel_active_jobs?: boolean; drain_timeout_seconds?: number };
      }>,
      reply: FastifyReply,
    ) => {
      await adminOnly(request);
      const { ghosthandsClient } = request.diScope.cradle;
      const { workerId } = request.params;
      const body = request.body ?? {};
      try {
        const result = await ghosthandsClient.deregisterWorker({
          target_worker_id: workerId,
          reason: body.reason ?? "admin_deregister",
          cancel_active_jobs: body.cancel_active_jobs,
          drain_timeout_seconds: body.drain_timeout_seconds,
        });
        return reply.send(result);
      } catch (err) {
        request.log.error({ err }, "Failed to deregister worker");
        return reply.status(502).send({ error: "GhostHands API unreachable" });
      }
    },
  );
}
