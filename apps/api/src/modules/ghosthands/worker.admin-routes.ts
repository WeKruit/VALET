import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { adminOnly } from "../../common/middleware/admin.js";

function enrichWorker(
  w: {
    worker_id: string;
    target_worker_id?: string | null;
    ec2_ip?: string | null;
    status: string;
    current_job_id: string | null;
    registered_at: string;
    last_heartbeat: string;
    jobs_completed: number;
    jobs_failed: number;
    uptime_seconds?: number | null;
  },
  sandboxMap: Map<string, { id: string; name: string; environment: string }>,
  jobTaskMap: Map<string, string>,
) {
  const sandbox = sandboxMap.get(w.worker_id) ?? sandboxMap.get(w.target_worker_id ?? "");
  return {
    worker_id: w.worker_id,
    sandbox_id: sandbox?.id ?? null,
    sandbox_name: sandbox?.name ?? null,
    environment: sandbox?.environment ?? null,
    ec2_ip: w.ec2_ip ?? null,
    status: w.status,
    current_job_id: w.current_job_id,
    valet_task_id: w.current_job_id ? (jobTaskMap.get(w.current_job_id) ?? null) : null,
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
    const { ghosthandsClient, sandboxRepo, ghJobRepo } = request.diScope.cradle;
    try {
      const [fleetData, activeSandboxes] = await Promise.all([
        ghosthandsClient.getWorkerFleet(),
        sandboxRepo.findAllActive(),
      ]);

      // Resolve current_job_id → valet_task_id for workers with active jobs
      const activeJobIds = fleetData.workers
        .map((w) => w.current_job_id)
        .filter((id): id is string => id != null);
      const jobTaskMap = new Map<string, string>();
      if (activeJobIds.length > 0) {
        const jobs = await ghJobRepo.findByIds(activeJobIds);
        for (const j of jobs) {
          if (j.valetTaskId) jobTaskMap.set(j.id, j.valetTaskId);
        }
      }

      const sandboxMap = new Map(activeSandboxes.map((s) => [s.id, s]));
      const workers = fleetData.workers.map((w) => enrichWorker(w, sandboxMap, jobTaskMap));
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
      const { ghosthandsClient, sandboxRepo, ghJobRepo } = request.diScope.cradle;
      const { workerId } = request.params;
      try {
        const [fleetData, activeSandboxes] = await Promise.all([
          ghosthandsClient.getWorkerFleet(),
          sandboxRepo.findAllActive(),
        ]);
        const worker = fleetData.workers.find((w) => w.worker_id === workerId);
        if (!worker) return reply.status(404).send({ error: "Worker not found" });

        const jobTaskMap = new Map<string, string>();
        if (worker.current_job_id) {
          const jobs = await ghJobRepo.findByIds([worker.current_job_id]);
          for (const j of jobs) {
            if (j.valetTaskId) jobTaskMap.set(j.id, j.valetTaskId);
          }
        }

        const sandboxMap = new Map(activeSandboxes.map((s) => [s.id, s]));
        return reply.send(enrichWorker(worker, sandboxMap, jobTaskMap));
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
