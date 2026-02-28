import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { adminOnly } from "../../common/middleware/admin.js";
import { AgentError } from "../sandboxes/agent/sandbox-agent.client.js";
import type { AtmFleetClient, AtmWorkerState } from "../sandboxes/atm-fleet.client.js";
import type { SandboxRecord } from "../sandboxes/sandbox.repository.js";

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
    ec2_state?: string | null;
    active_jobs?: number | null;
    transitioning?: boolean;
    source?: "atm" | "gh";
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
    ec2_state: w.ec2_state ?? null,
    active_jobs: w.active_jobs ?? null,
    transitioning: w.transitioning ?? false,
    source: w.source ?? ("gh" as const),
  };
}

/** Map ATM worker state → GH-compatible worker shape for enrichWorker() */
function atmWorkerToFleetWorker(w: AtmWorkerState) {
  return {
    worker_id: w.serverId,
    target_worker_id: null,
    ec2_ip: w.ip || null,
    status: w.ec2State === "running" ? (w.activeJobs > 0 ? "busy" : "idle") : w.ec2State,
    current_job_id: null as string | null,
    registered_at: new Date().toISOString(),
    last_heartbeat: new Date().toISOString(),
    jobs_completed: 0,
    jobs_failed: 0,
    uptime_seconds: w.idleSinceMs > 0 ? Math.round(w.idleSinceMs / 1000) : null,
    ec2_state: w.ec2State,
    active_jobs: w.activeJobs,
    transitioning: w.transitioning,
    source: "atm" as const,
  };
}

export async function workerAdminRoutes(fastify: FastifyInstance) {
  fastify.get("/api/v1/admin/workers", async (request: FastifyRequest, reply: FastifyReply) => {
    await adminOnly(request);
    const { ghosthandsClient, sandboxRepo, ghJobRepo, atmFleetClient } = request.diScope.cradle as {
      ghosthandsClient: any;
      sandboxRepo: any;
      ghJobRepo: any;
      atmFleetClient: AtmFleetClient;
    };

    // Primary: ATM fleet data (works even when GH is stopped)
    if (atmFleetClient.isConfigured) {
      try {
        const [atmStatus, activeSandboxes] = await Promise.all([
          atmFleetClient.getIdleStatus(),
          sandboxRepo.findAllActive(),
        ]);

        const sandboxMap = new Map<string, { id: string; name: string; environment: string }>(
          activeSandboxes.map((s: SandboxRecord) => [s.id, s]),
        );
        // Also index by instanceId for ATM worker matching
        for (const s of activeSandboxes) {
          if (s.instanceId) sandboxMap.set(s.instanceId, s);
        }

        const atmWorkers = atmStatus.workers.map((w) => {
          const fleetWorker = atmWorkerToFleetWorker(w);
          return enrichWorker(fleetWorker, sandboxMap, new Map<string, string>());
        });

        return reply.send({ workers: atmWorkers, total: atmWorkers.length, source: "atm" });
      } catch (err) {
        request.log.warn({ err }, "ATM fleet unreachable, falling back to GH direct");
      }
    }

    // Fallback: GH direct call
    try {
      const [fleetData, activeSandboxes] = await Promise.all([
        ghosthandsClient.getWorkerFleet(),
        sandboxRepo.findAllActive(),
      ]);

      const activeJobIds = fleetData.workers
        .map((w: any) => w.current_job_id)
        .filter((id: any): id is string => id != null);
      const jobTaskMap = new Map<string, string>();
      if (activeJobIds.length > 0) {
        const jobs = await ghJobRepo.findByIds(activeJobIds);
        for (const j of jobs) {
          if (j.valetTaskId) jobTaskMap.set(j.id, j.valetTaskId);
        }
      }

      const sandboxMap = new Map<string, { id: string; name: string; environment: string }>(
        activeSandboxes.map((s: SandboxRecord) => [s.id, s]),
      );
      const workers = fleetData.workers.map((w: any) => enrichWorker(w, sandboxMap, jobTaskMap));
      return reply.send({ workers, total: workers.length, source: "gh" });
    } catch (err) {
      request.log.error({ err }, "Failed to fetch worker fleet");
      return reply.status(502).send({ error: "GhostHands API unreachable" });
    }
  });

  fastify.get(
    "/api/v1/admin/workers/:workerId",
    async (request: FastifyRequest<{ Params: { workerId: string } }>, reply: FastifyReply) => {
      await adminOnly(request);
      const { ghosthandsClient, sandboxRepo, ghJobRepo, atmFleetClient } = request.diScope
        .cradle as {
        ghosthandsClient: any;
        sandboxRepo: any;
        ghJobRepo: any;
        atmFleetClient: AtmFleetClient;
      };
      const { workerId } = request.params;

      // Primary: ATM fleet health for this worker
      if (atmFleetClient.isConfigured) {
        try {
          const [atmStatus, activeSandboxes, atmHealth] = await Promise.all([
            atmFleetClient.getIdleStatus(),
            sandboxRepo.findAllActive(),
            atmFleetClient.getWorkerHealth(workerId).catch(() => null),
          ]);

          const atmWorker = atmStatus.workers.find((w) => w.serverId === workerId);
          if (!atmWorker) {
            // Worker not in ATM fleet — fall through to GH
          } else {
            const sandboxMap = new Map<string, { id: string; name: string; environment: string }>(
              activeSandboxes.map((s: SandboxRecord) => [s.id, s]),
            );
            for (const s of activeSandboxes) {
              if (s.instanceId) sandboxMap.set(s.instanceId, s);
            }

            const fleetWorker = atmWorkerToFleetWorker(atmWorker);
            const enriched = enrichWorker(fleetWorker, sandboxMap, new Map<string, string>());

            // If worker is running, try to get live status from GH too
            let liveStatus = null;
            let liveHealth = null;
            if (atmWorker.ec2State === "running") {
              [liveStatus, liveHealth] = await Promise.all([
                ghosthandsClient.getWorkerStatus(workerId).catch(() => null),
                ghosthandsClient.getWorkerHealth(workerId).catch(() => null),
              ]);
            }

            return reply.send({
              ...enriched,
              ec2_state: atmWorker.ec2State,
              active_jobs: atmWorker.activeJobs,
              transitioning: atmWorker.transitioning,
              live_status: liveStatus,
              live_health: liveHealth,
              atm_health: atmHealth,
              source: "atm",
            });
          }
        } catch (err) {
          request.log.warn({ err }, "ATM unreachable for worker detail, falling back to GH");
        }
      }

      // Fallback: GH direct
      try {
        const [fleetData, activeSandboxes, workerStatus, workerHealth] = await Promise.all([
          ghosthandsClient.getWorkerFleet(),
          sandboxRepo.findAllActive(),
          ghosthandsClient.getWorkerStatus(workerId).catch(() => null),
          ghosthandsClient.getWorkerHealth(workerId).catch(() => null),
        ]);
        const worker = fleetData.workers.find((w: any) => w.worker_id === workerId);
        if (!worker) return reply.status(404).send({ error: "Worker not found" });

        const jobTaskMap = new Map<string, string>();
        if (worker.current_job_id) {
          const jobs = await ghJobRepo.findByIds([worker.current_job_id]);
          for (const j of jobs) {
            if (j.valetTaskId) jobTaskMap.set(j.id, j.valetTaskId);
          }
        }

        const sandboxMap = new Map<string, { id: string; name: string; environment: string }>(
          activeSandboxes.map((s: SandboxRecord) => [s.id, s]),
        );
        const enriched = enrichWorker(worker, sandboxMap, jobTaskMap);
        return reply.send({
          ...enriched,
          live_status: workerStatus ?? null,
          live_health: workerHealth ?? null,
          source: "gh",
        });
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

  fastify.post(
    "/api/v1/admin/workers/:workerId/drain",
    async (
      request: FastifyRequest<{
        Params: { workerId: string };
      }>,
      reply: FastifyReply,
    ) => {
      await adminOnly(request);
      const { ghosthandsClient, sandboxRepo, sandboxProviderFactory, sandboxAgentClient } =
        request.diScope.cradle;
      const { workerId } = request.params;

      try {
        // 1. Find the worker in the fleet
        const [fleetData, activeSandboxes] = await Promise.all([
          ghosthandsClient.getWorkerFleet(),
          sandboxRepo.findAllActive(),
        ]);
        const worker = fleetData.workers.find((w) => w.worker_id === workerId);
        if (!worker) {
          return reply.status(404).send({ error: "Worker not found in fleet" });
        }

        // 2. Find the sandbox — try ec2_ip match first, fall back to worker_id/target_worker_id
        const sandboxByIp = worker.ec2_ip
          ? activeSandboxes.find((s) => s.publicIp === worker.ec2_ip)
          : null;
        const sandboxById =
          activeSandboxes.find((s) => s.id === worker.worker_id) ??
          activeSandboxes.find((s) => s.id === worker.target_worker_id);
        const sandbox = sandboxByIp ?? sandboxById ?? null;
        if (!sandbox) {
          return reply.status(404).send({ error: `No sandbox found for worker ${workerId}` });
        }

        // 3. Get agent URL via provider and call drain
        const provider = sandboxProviderFactory.getProvider(sandbox);
        const agentUrl = provider.getAgentUrl(sandbox);
        const result = await sandboxAgentClient.drain(agentUrl, workerId);

        return reply.send({
          success: result.success,
          drainedWorkers: result.drainedWorkers,
          message: result.message,
          workerId,
          sandboxId: sandbox.id,
          sandboxName: sandbox.name,
        });
      } catch (err) {
        if (err instanceof AgentError) {
          request.log.error({ err, workerId }, "Agent error during drain");
          return reply.status(502).send({
            error: "Agent unreachable",
            message: err.responseBody,
          });
        }
        request.log.error({ err, workerId }, "Failed to drain worker");
        return reply.status(502).send({ error: "Failed to drain worker" });
      }
    },
  );
}
