import type { FastifyBaseLogger } from "fastify";
import type {
  SandboxCreateRequest,
  SandboxUpdateRequest,
  SandboxHealthStatus,
  Ec2Status,
} from "@valet/shared/schemas";
import type { SandboxRepository } from "./sandbox.repository.js";
import type { TaskRepository } from "../tasks/task.repository.js";
import type { GhostHandsClient } from "../ghosthands/ghosthands.client.js";
import type { SandboxProviderFactory } from "./providers/provider-factory.js";
import type { SandboxAgentClient } from "./agent/sandbox-agent.client.js";
import type { MachineStatus } from "./providers/sandbox-provider.interface.js";
import type { DeepHealthChecker, DeepHealthResult } from "./deep-health-checker.js";
import {
  SandboxNotFoundError,
  SandboxDuplicateInstanceError,
  SandboxUnreachableError,
} from "./sandbox.errors.js";
import { AppError } from "../../common/errors.js";

export class SandboxService {
  private sandboxRepo: SandboxRepository;
  private logger: FastifyBaseLogger;
  private taskRepo: TaskRepository;
  private ghosthandsClient: GhostHandsClient;
  private providerFactory: SandboxProviderFactory;
  private sandboxAgentClient: SandboxAgentClient;
  private deepHealthChecker: DeepHealthChecker;

  constructor({
    sandboxRepo,
    logger,
    taskRepo,
    ghosthandsClient,
    sandboxProviderFactory,
    sandboxAgentClient,
    deepHealthChecker,
  }: {
    sandboxRepo: SandboxRepository;
    logger: FastifyBaseLogger;
    taskRepo: TaskRepository;
    ghosthandsClient: GhostHandsClient;
    sandboxProviderFactory: SandboxProviderFactory;
    sandboxAgentClient: SandboxAgentClient;
    deepHealthChecker: DeepHealthChecker;
  }) {
    this.sandboxRepo = sandboxRepo;
    this.logger = logger;
    this.taskRepo = taskRepo;
    this.ghosthandsClient = ghosthandsClient;
    this.providerFactory = sandboxProviderFactory;
    this.sandboxAgentClient = sandboxAgentClient;
    this.deepHealthChecker = deepHealthChecker;
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

    // Skip health check for stopped/terminated instances — they can't respond
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
        details: { skipped: true, reason: `Instance is ${sandbox.ec2Status}` },
      };
    }

    // Use deep health check to probe all required services
    let deepResult: DeepHealthResult;
    try {
      deepResult = await this.deepHealthChecker.check(sandbox);
    } catch (err) {
      this.logger.warn({ sandboxId: id, err }, "Deep health check threw unexpectedly");
      await this.sandboxRepo.updateHealthStatus(id, "unhealthy");
      return {
        sandboxId: id,
        healthStatus: "unhealthy" as SandboxHealthStatus,
        checkedAt: new Date(),
        details: { error: err instanceof Error ? err.message : "Unknown error" },
      };
    }

    const healthStatus = deepResult.overall as SandboxHealthStatus;

    // Store the full deep health result in browserConfig so the UI can display per-port status
    const updatedBrowserConfig = {
      ...(sandbox.browserConfig ?? {}),
      deepHealth: {
        overall: deepResult.overall,
        checks: deepResult.checks,
        timestamp: deepResult.timestamp,
      },
    };

    await this.sandboxRepo.update(id, {
      healthStatus,
      lastHealthCheckAt: new Date(),
      browserConfig: updatedBrowserConfig,
    });

    return {
      sandboxId: id,
      healthStatus,
      checkedAt: new Date(),
      details: {
        overall: deepResult.overall,
        checks: deepResult.checks,
        timestamp: deepResult.timestamp,
      },
    };
  }

  /**
   * Perform a deep health check that probes ALL required services on a sandbox
   * and returns structured per-port results.
   */
  async deepHealthCheck(id: string): Promise<DeepHealthResult & { sandboxId: string }> {
    const sandbox = await this.sandboxRepo.findById(id);
    if (!sandbox) throw new SandboxNotFoundError(id);

    // For stopped/terminated instances, return all-down immediately
    if (
      sandbox.ec2Status === "stopped" ||
      sandbox.ec2Status === "terminated" ||
      sandbox.ec2Status === "stopping"
    ) {
      return {
        sandboxId: id,
        overall: "unhealthy",
        checks: [],
        timestamp: Date.now(),
      };
    }

    const result = await this.deepHealthChecker.check(sandbox);

    // Persist the result
    const updatedBrowserConfig = {
      ...(sandbox.browserConfig ?? {}),
      deepHealth: {
        overall: result.overall,
        checks: result.checks,
        timestamp: result.timestamp,
      },
    };

    await this.sandboxRepo.update(id, {
      healthStatus: result.overall as SandboxHealthStatus,
      lastHealthCheckAt: new Date(),
      browserConfig: updatedBrowserConfig,
    });

    return {
      sandboxId: id,
      ...result,
    };
  }

  async getMetrics(id: string) {
    const sandbox = await this.sandboxRepo.findById(id);
    if (!sandbox) throw new SandboxNotFoundError(id);

    const provider = this.providerFactory.getProvider(sandbox);
    let agentUrl: string;
    try {
      agentUrl = provider.getAgentUrl(sandbox);
    } catch {
      throw new SandboxUnreachableError(id);
    }

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

    // restartAdspower only applies to adspower browser engine
    if (sandbox.browserEngine !== "adspower") {
      throw new AppError(
        400,
        "INVALID_BROWSER_ENGINE",
        `Cannot restart AdsPower on sandbox with browser engine: ${sandbox.browserEngine}`,
      );
    }

    const provider = this.providerFactory.getProvider(sandbox);
    let agentUrl: string;
    try {
      agentUrl = provider.getAgentUrl(sandbox);
    } catch {
      throw new SandboxUnreachableError(id);
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10_000);

      const response = await fetch(`${agentUrl}/restart-adspower`, {
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
      if (err instanceof AppError) throw err;
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
    const result = await provider.startMachine(sandbox);

    // Persist provider metadata (e.g., kasm_id, kasm_url, hostname)
    const updateData: Record<string, unknown> = {
      lastStartedAt: new Date(),
    };
    if (result.metadata) {
      if (result.metadata.kasm_id) updateData.instanceId = result.metadata.kasm_id;
      if (result.metadata.kasm_url) updateData.novncUrl = result.metadata.kasm_url;
      if (result.metadata.hostname) updateData.publicIp = result.metadata.hostname;
      updateData.tags = { ...(sandbox.tags ?? {}), ...result.metadata };
    }

    await this.sandboxRepo.updateEc2Status(id, "pending", updateData);

    // Poll in background — don't block the response
    this.pollMachineStatusUntilStable(id, "running").catch((err) => {
      this.logger.error({ sandboxId: id, err }, "Failed to poll machine status after start");
    });

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

    // Poll in background — don't block the response
    this.pollMachineStatusUntilStable(id, "stopped").catch((err) => {
      this.logger.error({ sandboxId: id, err }, "Failed to poll machine status after stop");
    });

    return { message: `Stopping sandbox ${sandbox.name}`, ec2Status: "stopping" };
  }

  async getMachineStatus(id: string): Promise<{
    sandboxId: string;
    ec2Status: Ec2Status;
    publicIp: string | null;
    lastStartedAt: Date | null;
    lastStoppedAt: Date | null;
  }> {
    const sandbox = await this.sandboxRepo.findById(id);
    if (!sandbox) throw new SandboxNotFoundError(id);

    const provider = this.providerFactory.getProvider(sandbox);
    const status = await provider.getMachineStatus(sandbox);
    const dbStatus = this.mapToDbStatus(status.state);

    // Sync DB if status changed
    if (dbStatus && dbStatus !== sandbox.ec2Status) {
      await this.sandboxRepo.updateEc2Status(id, dbStatus);
    }

    return {
      sandboxId: id,
      ec2Status: dbStatus ?? sandbox.ec2Status ?? "stopped",
      publicIp: status.publicIp ?? sandbox.publicIp ?? null,
      lastStartedAt: sandbox.lastStartedAt,
      lastStoppedAt: sandbox.lastStoppedAt,
    };
  }

  async sendKeepalive(id: string) {
    const sandbox = await this.sandboxRepo.findById(id);
    if (!sandbox) return;

    const provider = this.providerFactory.getProvider(sandbox);
    // Only send keepalive if the provider supports it
    if (provider.keepalive) {
      try {
        await provider.keepalive(sandbox);
      } catch (err) {
        this.logger.warn({ sandboxId: id, err }, "Failed to send keepalive");
      }
    }
  }

  private mapToDbStatus(state: MachineStatus["state"]): Ec2Status | null {
    const stateMap: Record<string, Ec2Status> = {
      running: "running",
      stopped: "stopped",
      starting: "pending",
      stopping: "stopping",
      terminated: "terminated",
    };
    return stateMap[state] ?? null;
  }

  private async pollMachineStatusUntilStable(
    sandboxId: string,
    targetState: "running" | "stopped",
    timeoutMs = 120_000,
    pollIntervalMs = 5_000,
  ) {
    const start = Date.now();
    const targetDbStatus = targetState as Ec2Status;

    while (Date.now() - start < timeoutMs) {
      const sandbox = await this.sandboxRepo.findById(sandboxId);
      if (!sandbox) return;

      const provider = this.providerFactory.getProvider(sandbox);
      const status = await provider.getMachineStatus(sandbox);
      const dbStatus = this.mapToDbStatus(status.state);

      this.logger.debug({ sandboxId, state: status.state, targetState }, "Polling machine status");

      if (dbStatus === targetDbStatus) {
        await this.sandboxRepo.updateEc2Status(sandboxId, dbStatus);
        this.logger.info({ sandboxId, finalStatus: dbStatus }, "Machine reached stable state");
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    // Timeout — do a final status sync
    const sandbox = await this.sandboxRepo.findById(sandboxId);
    if (sandbox) {
      const provider = this.providerFactory.getProvider(sandbox);
      const finalStatus = await provider.getMachineStatus(sandbox);
      const dbStatus = this.mapToDbStatus(finalStatus.state);
      if (dbStatus) {
        await this.sandboxRepo.updateEc2Status(sandboxId, dbStatus);
      }
      this.logger.warn(
        { sandboxId, finalState: finalStatus.state, targetState, timeoutMs },
        "Timed out waiting for machine status",
      );
    }
  }

  /**
   * Enforce state consistency: any sandbox marked 'active' + 'healthy' that
   * has NOT passed a health check within the last 10 minutes gets downgraded
   * to healthStatus='degraded'. A sandbox must continuously prove health.
   */
  async enforceStateConsistency(): Promise<number> {
    const STALE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes
    const staleSandboxes = await this.sandboxRepo.findStaleActive(STALE_THRESHOLD_MS);

    for (const sandbox of staleSandboxes) {
      const minutesSinceCheck = sandbox.lastHealthCheckAt
        ? Math.round((Date.now() - sandbox.lastHealthCheckAt.getTime()) / 60_000)
        : "never";

      this.logger.warn(
        {
          sandboxId: sandbox.id,
          sandboxName: sandbox.name,
          lastHealthCheckAt: sandbox.lastHealthCheckAt?.toISOString() ?? null,
          minutesSinceCheck,
        },
        "Downgrading sandbox health: no successful health check within 10 minutes",
      );

      await this.sandboxRepo.updateHealthStatus(sandbox.id, "degraded");
    }

    if (staleSandboxes.length > 0) {
      this.logger.info(
        { count: staleSandboxes.length },
        "State consistency enforced — downgraded stale healthy sandboxes to degraded",
      );
    }

    return staleSandboxes.length;
  }

  async checkAllSandboxes() {
    const activeSandboxes = await this.sandboxRepo.findAllActive();
    const results = [];
    let skipped = 0;

    for (const sandbox of activeSandboxes) {
      // Skip health checks for non-running instances
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
