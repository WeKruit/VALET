import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { adminOnly } from "../../common/middleware/admin.js";
import { AgentError } from "../sandboxes/agent/sandbox-agent.client.js";
import type { AtmFleetClient, AtmWorkerState } from "../sandboxes/atm-fleet.client.js";
import type { SandboxRecord } from "../sandboxes/sandbox.repository.js";

/**
 * Build a set of sandbox IDs that are managed by ATM.
 * A sandbox is ATM-managed if EITHER of:
 * 1. tags.atm_fleet_id is set (explicit ATM assignment via startMachine)
 * 2. Its instanceId matches an ATM fleet worker's instanceId (runtime cross-ref)
 *
 * When ATM is configured but unreachable (can't do cross-ref), sandboxes with
 * tags.asg_managed === true are treated as POTENTIALLY ATM-managed (fail closed).
 * This covers the window between instance-discovery/seed creating the record and
 * the first startMachine call tagging it with atm_fleet_id. Direct-EC2 fallback
 * sandboxes (no asg_managed, no atm_fleet_id) are NOT blocked — the codebase
 * explicitly supports EC2 sandboxes outside ATM even when ATM is configured
 * (Ec2SandboxProvider.startMachine falls back to direct EC2 SDK when
 * resolveFleetId returns null).
 *
 * NOTE: asg_managed is NOT a permanent ownership signal (ASGs can run without
 * ATM in GH-only deploys). It is only used as a fail-closed narrowing heuristic
 * when ATM is configured but temporarily unreachable.
 */
function buildAtmManagedSet(
  sandboxes: SandboxRecord[],
  atmWorkerInstanceIds?: Set<string>,
  atmConfiguredButUnreachable?: boolean,
): { managed: Set<string>; unverified: Set<string> } {
  const managed = new Set<string>();
  const unverified = new Set<string>();
  for (const s of sandboxes) {
    const tags = s.tags as Record<string, unknown> | null;
    const isTagged = typeof tags === "object" && tags !== null;
    if (isTagged && tags.atm_fleet_id) {
      managed.add(s.id);
      continue;
    }
    if (atmWorkerInstanceIds && s.instanceId && atmWorkerInstanceIds.has(s.instanceId)) {
      managed.add(s.id);
      continue;
    }
    // Fail closed: ATM configured but down + sandbox is in an ASG → likely ATM-managed.
    // Direct-EC2 fallback sandboxes (no asg_managed) are NOT caught here.
    // Unverified IDs are exposed to the UI so it can distinguish from confirmed ownership.
    if (atmConfiguredButUnreachable && isTagged && tags.asg_managed === true) {
      managed.add(s.id);
      unverified.add(s.id);
    }
  }
  return { managed, unverified };
}

function enrichWorker(
  w: {
    worker_id: string;
    target_worker_id?: string | null;
    instance_id?: string | null;
    ec2_instance_id?: string | null;
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
  },
  sandboxMap: Map<string, { id: string; name: string; environment: string }>,
  jobTaskMap: Map<string, string>,
  atmManagedIds: Set<string>,
  atmUnverifiedIds?: Set<string>,
) {
  // instance_id is set by atmWorkerToFleetWorker; ec2_instance_id is the GH field name
  const instanceId = w.instance_id ?? w.ec2_instance_id;
  const sandbox =
    sandboxMap.get(w.worker_id) ??
    sandboxMap.get(instanceId ?? "") ??
    sandboxMap.get(w.target_worker_id ?? "");
  // Ownership is determined by sandbox tags, not transport
  const source = sandbox && atmManagedIds.has(sandbox.id) ? ("atm" as const) : ("gh" as const);
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
    source,
    atm_unverified: sandbox ? (atmUnverifiedIds?.has(sandbox.id) ?? false) : false,
  };
}

/** Map ATM worker state → GH-compatible worker shape for enrichWorker() */
function atmWorkerToFleetWorker(w: AtmWorkerState) {
  // Normalize ATM ec2State → operational status matching GH conventions
  // (active/draining/offline). Raw ec2State is passed separately via ec2_state.
  let status: string;
  if (w.ec2State === "running") {
    status = "active";
  } else if (w.ec2State === "stopping") {
    status = "draining";
  } else {
    // stopped, standby, pending → offline (can't accept jobs)
    status = "offline";
  }

  return {
    worker_id: w.serverId,
    target_worker_id: null,
    instance_id: w.instanceId,
    ec2_ip: w.ip || null,
    status,
    current_job_id: null as string | null,
    registered_at: new Date().toISOString(),
    last_heartbeat: new Date().toISOString(),
    jobs_completed: 0,
    jobs_failed: 0,
    uptime_seconds: w.idleSinceMs > 0 ? Math.round(w.idleSinceMs / 1000) : null,
    ec2_state: w.ec2State,
    active_jobs: w.activeJobs,
    transitioning: w.transitioning,
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
    let atmUnreachable = false;
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
        const atmWorkerInstanceIds = new Set(
          atmStatus.workers.map((w) => w.instanceId).filter((id): id is string => id != null),
        );
        const { managed: atmManagedIds } = buildAtmManagedSet(
          activeSandboxes,
          atmWorkerInstanceIds,
        );

        const atmWorkers = atmStatus.workers.map((w) => {
          const fleetWorker = atmWorkerToFleetWorker(w);
          return enrichWorker(fleetWorker, sandboxMap, new Map<string, string>(), atmManagedIds);
        });

        return reply.send({ workers: atmWorkers, total: atmWorkers.length, source: "atm" });
      } catch (err) {
        request.log.warn({ err }, "ATM fleet unreachable, falling back to GH direct");
        atmUnreachable = true;
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
      for (const s of activeSandboxes) {
        if (s.instanceId) sandboxMap.set(s.instanceId, s);
      }
      // Fail closed: if ATM was configured but unreachable, treat ASG sandboxes as ATM-managed
      const { managed: atmManagedIds, unverified: atmUnverifiedIds } = buildAtmManagedSet(
        activeSandboxes,
        undefined,
        atmUnreachable,
      );
      const workers = fleetData.workers.map((w: any) =>
        enrichWorker(w, sandboxMap, jobTaskMap, atmManagedIds, atmUnverifiedIds),
      );
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

            const atmWorkerInstanceIds = new Set(
              atmStatus.workers.map((w) => w.instanceId).filter((id): id is string => id != null),
            );
            const { managed: atmManagedIds } = buildAtmManagedSet(
              activeSandboxes,
              atmWorkerInstanceIds,
            );
            const fleetWorker = atmWorkerToFleetWorker(atmWorker);
            const enriched = enrichWorker(
              fleetWorker,
              sandboxMap,
              new Map<string, string>(),
              atmManagedIds,
            );

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
        for (const s of activeSandboxes) {
          if (s.instanceId) sandboxMap.set(s.instanceId, s);
        }
        const { managed: atmManagedIds } = buildAtmManagedSet(activeSandboxes);
        const enriched = enrichWorker(worker, sandboxMap, jobTaskMap, atmManagedIds);
        return reply.send({
          ...enriched,
          live_status: workerStatus ?? null,
          live_health: workerHealth ?? null,
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
      const { ghosthandsClient, sandboxRepo, atmFleetClient } = request.diScope.cradle as {
        ghosthandsClient: any;
        sandboxRepo: any;
        atmFleetClient: AtmFleetClient;
      };
      const { workerId } = request.params;
      const body = request.body ?? {};
      try {
        // Validate worker exists in GH fleet before proxying
        const [fleetData, activeSandboxes] = await Promise.all([
          ghosthandsClient.getWorkerFleet(),
          sandboxRepo.findAllActive(),
        ]);
        const worker = fleetData.workers.find(
          (w: { worker_id: string; target_worker_id?: string | null }) =>
            w.worker_id === workerId || w.target_worker_id === workerId,
        );
        if (!worker) {
          return reply.status(404).send({ error: "Worker not found in GH fleet" });
        }

        // Build ATM managed set — use ATM fleet data for instanceId cross-reference if available
        let atmWorkerInstanceIds: Set<string> | undefined;
        let atmUnreachable = false;
        if (atmFleetClient.isConfigured) {
          try {
            const atmStatus = await atmFleetClient.getIdleStatus();
            atmWorkerInstanceIds = new Set(
              atmStatus.workers.map((w) => w.instanceId).filter((id): id is string => id != null),
            );
          } catch {
            atmUnreachable = true;
          }
        }
        const { managed: atmManagedIds } = buildAtmManagedSet(
          activeSandboxes,
          atmWorkerInstanceIds,
          atmUnreachable,
        );

        // Resolve sandbox by all available identifiers — ID/instanceId first, IP fallback
        const sandboxMap = new Map<string, SandboxRecord>(
          activeSandboxes.map((s: SandboxRecord) => [s.id, s]),
        );
        for (const s of activeSandboxes) {
          if (s.instanceId) sandboxMap.set(s.instanceId, s);
        }
        const sandboxById =
          sandboxMap.get(workerId) ??
          sandboxMap.get(worker.worker_id) ??
          sandboxMap.get(worker.target_worker_id ?? "") ??
          sandboxMap.get(worker.ec2_instance_id ?? "");
        const sandboxByIp = worker.ec2_ip
          ? activeSandboxes.find((s: SandboxRecord) => s.publicIp === worker.ec2_ip)
          : null;
        const sandbox = sandboxById ?? sandboxByIp ?? null;
        if (sandbox && atmManagedIds.has(sandbox.id)) {
          // Distinguish confirmed ATM ownership from fail-closed uncertainty
          const hasAtmTag =
            typeof sandbox.tags === "object" &&
            sandbox.tags !== null &&
            (sandbox.tags as Record<string, unknown>).atm_fleet_id;
          if (atmUnreachable && !hasAtmTag) {
            return reply.status(503).send({
              error:
                "ATM is unreachable — cannot verify worker ownership for this EC2 instance. Retry when ATM is available.",
            });
          }
          return reply.status(400).send({
            error: "Worker is managed by ATM — use sandbox start/stop instead",
          });
        }

        // Forward the fleet entry's own target_worker_id (or worker_id) to GH —
        // the URL param may differ from the canonical GH registry identifier
        const result = await ghosthandsClient.deregisterWorker({
          target_worker_id: worker.target_worker_id ?? worker.worker_id,
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
      const {
        ghosthandsClient,
        sandboxRepo,
        sandboxProviderFactory,
        sandboxAgentClient,
        atmFleetClient,
      } = request.diScope.cradle as {
        ghosthandsClient: any;
        sandboxRepo: any;
        sandboxProviderFactory: any;
        sandboxAgentClient: any;
        atmFleetClient: AtmFleetClient;
      };
      const { workerId } = request.params;

      try {
        // 1. Find the worker in the fleet
        const [fleetData, activeSandboxes] = await Promise.all([
          ghosthandsClient.getWorkerFleet(),
          sandboxRepo.findAllActive(),
        ]);
        const worker = fleetData.workers.find(
          (w: { worker_id: string; target_worker_id?: string | null }) =>
            w.worker_id === workerId || w.target_worker_id === workerId,
        );
        if (!worker) {
          return reply.status(404).send({ error: "Worker not found in fleet" });
        }

        // 1b. Build ATM managed set with instanceId cross-reference if ATM is available
        let atmWorkerInstanceIds: Set<string> | undefined;
        let atmUnreachable = false;
        if (atmFleetClient.isConfigured) {
          try {
            const atmStatus = await atmFleetClient.getIdleStatus();
            atmWorkerInstanceIds = new Set(
              atmStatus.workers.map((w) => w.instanceId).filter((id): id is string => id != null),
            );
          } catch {
            atmUnreachable = true;
          }
        }
        const { managed: atmManagedIds } = buildAtmManagedSet(
          activeSandboxes,
          atmWorkerInstanceIds,
          atmUnreachable,
        );

        // 2. Find the sandbox — ID/instanceId first, then IP fallback
        const sandboxMap = new Map<string, SandboxRecord>(
          activeSandboxes.map((s: SandboxRecord) => [s.id, s]),
        );
        for (const s of activeSandboxes) {
          if (s.instanceId) sandboxMap.set(s.instanceId, s);
        }
        const sandboxById =
          sandboxMap.get(worker.worker_id) ??
          sandboxMap.get(worker.target_worker_id ?? "") ??
          sandboxMap.get(worker.ec2_instance_id ?? "");
        const sandboxByIp = worker.ec2_ip
          ? activeSandboxes.find((s: SandboxRecord) => s.publicIp === worker.ec2_ip)
          : null;
        const sandbox = sandboxById ?? sandboxByIp ?? null;
        if (!sandbox) {
          return reply.status(404).send({ error: `No sandbox found for worker ${workerId}` });
        }
        if (atmManagedIds.has(sandbox.id)) {
          const hasAtmTag =
            typeof sandbox.tags === "object" &&
            sandbox.tags !== null &&
            (sandbox.tags as Record<string, unknown>).atm_fleet_id;
          if (atmUnreachable && !hasAtmTag) {
            return reply.status(503).send({
              error:
                "ATM is unreachable — cannot verify worker ownership for this EC2 instance. Retry when ATM is available.",
            });
          }
          return reply.status(400).send({
            error: "Worker is managed by ATM — use sandbox start/stop instead",
          });
        }

        // 3. Get agent URL via provider and call drain — use canonical worker_id,
        //    not the raw URL param (which may be a target_worker_id)
        const provider = sandboxProviderFactory.getProvider(sandbox);
        const agentUrl = provider.getAgentUrl(sandbox);
        const result = await sandboxAgentClient.drain(agentUrl, worker.worker_id);

        return reply.send({
          success: result.success,
          drainedWorkers: result.drainedWorkers,
          message: result.message,
          workerId: worker.worker_id,
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
