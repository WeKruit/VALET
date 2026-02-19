import type { FastifyBaseLogger } from "fastify";
import type {
  SandboxCreateRequest,
  SandboxUpdateRequest,
  SandboxHealthStatus,
} from "@valet/shared/schemas";
import type { SandboxRepository } from "./sandbox.repository.js";
import type { EC2Service } from "./ec2.service.js";
import type { TaskRepository } from "../tasks/task.repository.js";
import type { GhostHandsClient } from "../ghosthands/ghosthands.client.js";
import type { SandboxProviderFactory } from "./providers/provider-factory.js";
import type { SandboxAgentClient } from "./agent/sandbox-agent.client.js";
import {
  SandboxNotFoundError,
  SandboxDuplicateInstanceError,
  SandboxUnreachableError,
} from "./sandbox.errors.js";
import { AppError } from "../../common/errors.js";

export class SandboxService {
  private sandboxRepo: SandboxRepository;
  private logger: FastifyBaseLogger;
  private ec2Service: EC2Service;
  private taskRepo: TaskRepository;
  private ghosthandsClient: GhostHandsClient;
  private providerFactory: SandboxProviderFactory;
  private sandboxAgentClient: SandboxAgentClient;

  constructor({
    sandboxRepo,
    logger,
    ec2Service,
    taskRepo,
    ghosthandsClient,
    sandboxProviderFactory,
    sandboxAgentClient,
  }: {
    sandboxRepo: SandboxRepository;
    logger: FastifyBaseLogger;
    ec2Service: EC2Service;
    taskRepo: TaskRepository;
    ghosthandsClient: GhostHandsClient;
    sandboxProviderFactory: SandboxProviderFactory;
    sandboxAgentClient: SandboxAgentClient;
  }) {
    this.sandboxRepo = sandboxRepo;
    this.logger = logger;
    this.ec2Service = ec2Service;
    this.taskRepo = taskRepo;
    this.ghosthandsClient = ghosthandsClient;
    this.providerFactory = sandboxProviderFactory;
    this.sandboxAgentClient = sandboxAgentClient;
  }

  async getById(id: string) {
    const sandbox = await this.sandboxRepo.findById(id);
    if (!sandbox) throw new SandboxNotFoundError(id);
    return sandbox;
  }

  async list(query: {
    page: number;
    pageSize: number;
    environment?: string;
    status?: string;
    healthStatus?: string;
    ec2Status?: string;
    search?: string;
    sortBy: string;
    sortOrder: string;
  }) {
    const { data, total } = await this.sandboxRepo.findMany(query);
    return {
      data,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  }

  async create(body: SandboxCreateRequest) {
    const existing = await this.sandboxRepo.findByInstanceId(body.instanceId);
    if (existing) throw new SandboxDuplicateInstanceError(body.instanceId);

    return this.sandboxRepo.create(body);
  }

  async update(id: string, body: SandboxUpdateRequest) {
    const existing = await this.sandboxRepo.findById(id);
    if (!existing) throw new SandboxNotFoundError(id);

    const updated = await this.sandboxRepo.update(id, body as Record<string, unknown>);
    if (!updated) throw new SandboxNotFoundError(id);
    return updated;
  }

  async terminate(id: string, userId?: string) {
    const existing = await this.sandboxRepo.findById(id);
    if (!existing) throw new SandboxNotFoundError(id);

    // Deregister the worker from GhostHands fleet
    try {
      await this.ghosthandsClient.deregisterWorker({
        target_worker_id: id,
        reason: "sandbox_terminated",
        cancel_active_jobs: true,
        drain_timeout_seconds: 30,
      });
      this.logger.info({ sandboxId: id }, "Deregistered worker from GhostHands");
    } catch (err) {
      this.logger.warn(
        { err, sandboxId: id },
        "Failed to deregister worker from GhostHands (non-critical)",
      );
    }

    // Cancel active tasks associated with this sandbox before terminating
    if (userId) {
      try {
        const activeTasks = await this.taskRepo.findActiveBySandbox(userId, id);
        for (const task of activeTasks) {
          this.logger.info(
            { taskId: task.id, sandboxId: id },
            "Cancelling task due to sandbox termination",
          );
          await this.taskRepo.updateStatus(task.id, "cancelled");

          // Cancel the GH job if it has one
          if (task.workflowRunId) {
            try {
              await this.ghosthandsClient.cancelJob(task.workflowRunId);
            } catch (err) {
              this.logger.warn(
                { err, taskId: task.id, jobId: task.workflowRunId },
                "Failed to cancel GH job during sandbox termination (non-critical)",
              );
            }
          }
        }
        if (activeTasks.length > 0) {
          this.logger.info(
            { sandboxId: id, cancelledCount: activeTasks.length },
            "Cancelled active tasks for terminated sandbox",
          );
        }
      } catch (err) {
        this.logger.error(
          { err, sandboxId: id },
          "Failed to cancel tasks during sandbox termination",
        );
      }
    }

    const terminated = await this.sandboxRepo.terminate(id);
    if (!terminated) throw new SandboxNotFoundError(id);
  }

  async healthCheck(id: string) {
    const sandbox = await this.sandboxRepo.findById(id);
    if (!sandbox) throw new SandboxNotFoundError(id);

    // Skip health check for stopped/terminated EC2 instances — they can't respond
    if (
      sandbox.ec2Status === "stopped" ||
      sandbox.ec2Status === "terminated" ||
      sandbox.ec2Status === "stopping"
    ) {
      this.logger.debug(
        { sandboxId: id, ec2Status: sandbox.ec2Status },
        "Skipping health check for non-running instance",
      );
      return {
        sandboxId: id,
        healthStatus: sandbox.healthStatus,
        checkedAt: new Date(),
        details: { skipped: true, reason: `EC2 instance is ${sandbox.ec2Status}` },
      };
    }

    if (!sandbox.publicIp) {
      await this.sandboxRepo.updateHealthStatus(id, "unhealthy");
      return {
        sandboxId: id,
        healthStatus: "unhealthy" as SandboxHealthStatus,
        checkedAt: new Date(),
        details: { error: "No public IP configured" },
      };
    }

    const agentUrl = `http://${sandbox.publicIp}:8000`;
    let healthStatus: SandboxHealthStatus = "unhealthy";
    let details: Record<string, unknown> = {};

    try {
      const body = await this.sandboxAgentClient.getHealth(agentUrl);
      healthStatus = "healthy";
      details = body as unknown as Record<string, unknown>;

      const rawBody = body as unknown as Record<string, unknown>;
      if (rawBody.adspowerStatus !== "ok") {
        healthStatus = "degraded";
      }
    } catch (err) {
      healthStatus = "unhealthy";
      details = { error: err instanceof Error ? err.message : "Unknown error" };
      this.logger.warn({ sandboxId: id, agentUrl, err }, "Health check failed for sandbox");
    }

    await this.sandboxRepo.updateHealthStatus(id, healthStatus);

    return {
      sandboxId: id,
      healthStatus,
      checkedAt: new Date(),
      details,
    };
  }

  async getMetrics(id: string) {
    const sandbox = await this.sandboxRepo.findById(id);
    if (!sandbox) throw new SandboxNotFoundError(id);

    if (!sandbox.publicIp) {
      throw new SandboxUnreachableError(id);
    }

    const agentUrl = `http://${sandbox.publicIp}:8000`;

    try {
      const metrics = await this.sandboxAgentClient.getMetrics(agentUrl);

      return {
        sandboxId: id,
        cpu: metrics?.cpu?.usagePercent ?? null,
        memoryUsedMb: metrics?.memory?.usedMb ?? null,
        memoryTotalMb: metrics?.memory?.totalMb ?? null,
        diskUsedGb: metrics?.disk?.usedGb ?? null,
        diskTotalGb: metrics?.disk?.totalGb ?? null,
        activeProfiles: 0,
        adspowerStatus: "unknown",
        uptime: null,
      };
    } catch (err) {
      if (err instanceof SandboxUnreachableError) throw err;
      throw new SandboxUnreachableError(id);
    }
  }

  async restartAdspower(id: string) {
    const sandbox = await this.sandboxRepo.findById(id);
    if (!sandbox) throw new SandboxNotFoundError(id);

    if (!sandbox.publicIp) {
      throw new SandboxUnreachableError(id);
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10_000);

      const response = await fetch(`http://${sandbox.publicIp}:8000/restart-adspower`, {
        method: "POST",
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new SandboxUnreachableError(id);
      }

      return { message: `AdsPower restart initiated on sandbox ${sandbox.name}` };
    } catch (err) {
      if (err instanceof SandboxUnreachableError) throw err;
      throw new SandboxUnreachableError(id);
    }
  }

  async startSandbox(id: string) {
    const sandbox = await this.sandboxRepo.findById(id);
    if (!sandbox) throw new SandboxNotFoundError(id);

    if (sandbox.ec2Status === "running" || sandbox.ec2Status === "pending") {
      throw new AppError(
        409,
        "SANDBOX_ALREADY_RUNNING",
        `Sandbox ${id} is already ${sandbox.ec2Status}`,
      );
    }

    const provider = this.providerFactory.getProvider(sandbox);
    await provider.startMachine(sandbox);
    await this.sandboxRepo.updateEc2Status(id, "pending", {
      lastStartedAt: new Date(),
    });

    // Poll in background — don't block the response (EC2-specific)
    if (provider.type === "ec2") {
      this.pollEc2StatusUntilStable(id, sandbox.instanceId, "running").catch((err) => {
        this.logger.error({ sandboxId: id, err }, "Failed to poll EC2 status after start");
      });
    }

    return { message: `Starting sandbox ${sandbox.name}`, ec2Status: "pending" };
  }

  async stopSandbox(id: string) {
    const sandbox = await this.sandboxRepo.findById(id);
    if (!sandbox) throw new SandboxNotFoundError(id);

    if (sandbox.ec2Status === "stopped" || sandbox.ec2Status === "stopping") {
      throw new AppError(
        409,
        "SANDBOX_ALREADY_STOPPED",
        `Sandbox ${id} is already ${sandbox.ec2Status}`,
      );
    }

    const provider = this.providerFactory.getProvider(sandbox);
    await provider.stopMachine(sandbox);
    await this.sandboxRepo.updateEc2Status(id, "stopping", {
      lastStoppedAt: new Date(),
    });

    // Poll in background (EC2-specific)
    if (provider.type === "ec2") {
      this.pollEc2StatusUntilStable(id, sandbox.instanceId, "stopped").catch((err) => {
        this.logger.error({ sandboxId: id, err }, "Failed to poll EC2 status after stop");
      });
    }

    return { message: `Stopping sandbox ${sandbox.name}`, ec2Status: "stopping" };
  }

  async getEc2Status(id: string) {
    const sandbox = await this.sandboxRepo.findById(id);
    if (!sandbox) throw new SandboxNotFoundError(id);

    const liveStatus = await this.ec2Service.getInstanceStatus(sandbox.instanceId);

    // Map AWS statuses to our enum
    const mappedStatus =
      liveStatus === "shutting-down"
        ? ("stopping" as const)
        : (liveStatus as "pending" | "running" | "stopping" | "stopped" | "terminated");

    // Sync DB if different
    if (mappedStatus !== sandbox.ec2Status) {
      await this.sandboxRepo.updateEc2Status(id, mappedStatus);
    }

    return {
      sandboxId: id,
      ec2Status: mappedStatus,
      publicIp: sandbox.publicIp,
      lastStartedAt: sandbox.lastStartedAt,
      lastStoppedAt: sandbox.lastStoppedAt,
    };
  }

  private async pollEc2StatusUntilStable(
    sandboxId: string,
    instanceId: string,
    targetStatus: "running" | "stopped",
  ) {
    const finalStatus = await this.ec2Service.waitForStatus(instanceId, targetStatus);
    const mappedStatus =
      finalStatus === "shutting-down"
        ? ("stopping" as const)
        : (finalStatus as "pending" | "running" | "stopping" | "stopped" | "terminated");
    await this.sandboxRepo.updateEc2Status(sandboxId, mappedStatus);

    this.logger.info(
      { sandboxId, instanceId, finalStatus: mappedStatus },
      "EC2 instance reached stable state",
    );
  }

  async checkAllSandboxes() {
    const activeSandboxes = await this.sandboxRepo.findAllActive();
    const results = [];
    let skipped = 0;

    for (const sandbox of activeSandboxes) {
      // Skip health checks for non-running EC2 instances
      if (sandbox.ec2Status !== "running" && sandbox.ec2Status !== "pending") {
        skipped++;
        this.logger.debug(
          { sandboxId: sandbox.id, name: sandbox.name, ec2Status: sandbox.ec2Status },
          "Skipping health check — instance not running",
        );
        continue;
      }

      try {
        const result = await this.healthCheck(sandbox.id);
        results.push(result);
      } catch (err) {
        this.logger.error(
          { sandboxId: sandbox.id, name: sandbox.name, err },
          "Failed to health-check sandbox",
        );
        results.push({
          sandboxId: sandbox.id,
          healthStatus: "unhealthy" as SandboxHealthStatus,
          checkedAt: new Date(),
          details: { error: err instanceof Error ? err.message : "Unknown error" },
        });
      }
    }

    if (skipped > 0) {
      this.logger.info({ skipped }, "Skipped health checks for non-running instances");
    }

    return results;
  }
}
