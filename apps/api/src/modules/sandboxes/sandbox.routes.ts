import { initServer } from "@ts-rest/fastify";
import { sandboxContract } from "@valet/contracts";
import { adminOnly } from "../../common/middleware/admin.js";
import { AppError } from "../../common/errors.js";
import type { DeployRecord } from "./deploy.service.js";

const s = initServer();

export const sandboxRouter = s.router(sandboxContract, {
  list: async ({ query, request }) => {
    await adminOnly(request);
    const { sandboxService } = request.diScope.cradle;
    const result = await sandboxService.list(query);
    return { status: 200, body: result };
  },

  getById: async ({ params, request }) => {
    await adminOnly(request);
    const { sandboxService } = request.diScope.cradle;
    const sandbox = await sandboxService.getById(params.id);
    return { status: 200, body: sandbox };
  },

  create: async ({ body, request }) => {
    await adminOnly(request);
    const { sandboxService } = request.diScope.cradle;
    const sandbox = await sandboxService.create(body);
    return { status: 201, body: sandbox };
  },

  update: async ({ params, body, request }) => {
    await adminOnly(request);
    const { sandboxService } = request.diScope.cradle;
    const sandbox = await sandboxService.update(params.id, body);
    return { status: 200, body: sandbox };
  },

  delete: async ({ params, request }) => {
    await adminOnly(request);
    const { sandboxService } = request.diScope.cradle;
    await sandboxService.terminate(params.id, request.userId);
    return { status: 204, body: undefined };
  },

  healthCheck: async ({ params, request }) => {
    await adminOnly(request);
    const { sandboxService } = request.diScope.cradle;
    const result = await sandboxService.healthCheck(params.id);
    return { status: 200, body: result };
  },

  deepHealthCheck: async ({ params, request }) => {
    await adminOnly(request);
    const { sandboxService } = request.diScope.cradle;
    const result = await sandboxService.deepHealthCheck(params.id);
    return { status: 200, body: result };
  },

  metrics: async ({ params, request }) => {
    await adminOnly(request);
    const { sandboxService } = request.diScope.cradle;
    const result = await sandboxService.getMetrics(params.id);
    return { status: 200, body: result };
  },

  restart: async ({ params, request }) => {
    await adminOnly(request);
    const { sandboxService } = request.diScope.cradle;
    const result = await sandboxService.restartAdspower(params.id);
    return { status: 200, body: result };
  },

  // ─── EC2 Controls ───

  startSandbox: async ({ params, request }) => {
    await adminOnly(request);
    const { sandboxService } = request.diScope.cradle;
    const result = await sandboxService.startSandbox(params.id);
    return { status: 200, body: result };
  },

  stopSandbox: async ({ params, request }) => {
    await adminOnly(request);
    const { sandboxService } = request.diScope.cradle;
    const result = await sandboxService.stopSandbox(params.id);
    return { status: 200, body: result };
  },

  getEc2Status: async ({ params, request }) => {
    await adminOnly(request);
    const { sandboxService } = request.diScope.cradle;
    const result = await sandboxService.getMachineStatus(params.id);
    return { status: 200, body: result };
  },

  triggerTask: async ({ params, body, request }) => {
    await adminOnly(request);
    const { sandboxService, taskService } = request.diScope.cradle;

    const sandbox = await sandboxService.getById(params.id);
    if (sandbox.ec2Status !== "running") {
      throw AppError.conflict(
        `Sandbox EC2 instance is ${sandbox.ec2Status ?? "unknown"}, must be running to trigger a task`,
      );
    }

    const task = await taskService.create(
      {
        jobUrl: body.jobUrl,
        resumeId: body.resumeId,
        mode: body.mode ?? "autopilot",
        notes: body.notes,
        quality: body.quality,
        targetWorkerId: sandbox.id,
      },
      request.userId,
    );

    return {
      status: 201 as const,
      body: {
        taskId: task.id,
        sandboxId: sandbox.id,
        targetWorkerId: sandbox.id,
        status: task.status,
      },
    };
  },

  triggerTest: async ({ params, body, request }) => {
    await adminOnly(request);
    const { sandboxService, taskService } = request.diScope.cradle;

    const sandbox = await sandboxService.getById(params.id);
    if (sandbox.ec2Status !== "running") {
      throw AppError.conflict(
        `Sandbox EC2 instance is ${sandbox.ec2Status ?? "unknown"}, must be running to trigger a test`,
      );
    }

    const task = await taskService.createTestTask(
      {
        searchQuery: body.searchQuery ?? "valet integration test",
        targetWorkerId: sandbox.id,
      },
      request.userId,
    );

    return {
      status: 201 as const,
      body: {
        taskId: task.id,
        sandboxId: sandbox.id,
        status: task.status,
      },
    };
  },

  // ─── Agent Operations ───

  getAgentStatus: async ({ params, request }) => {
    await adminOnly(request);
    const { sandboxService, sandboxProviderFactory, sandboxAgentClient, auditLogService } =
      request.diScope.cradle;

    const sandbox = await sandboxService.getById(params.id);
    const provider = sandboxProviderFactory.getProvider(sandbox);
    const agentUrl = provider.getAgentUrl(sandbox);

    try {
      const health = await sandboxAgentClient.getHealth(agentUrl);

      await auditLogService.log({
        sandboxId: sandbox.id,
        userId: request.userId,
        action: "agent_status",
        details: { endpoint: "agent-status" },
        ipAddress: request.ip,
        result: "success",
      });

      // Build full status from health + containers + workers
      const [containers, workers, version] = await Promise.all([
        sandboxAgentClient.getContainers(agentUrl),
        sandboxAgentClient.getWorkers(agentUrl),
        sandboxAgentClient.getVersion(agentUrl).catch(() => null),
      ]);

      return {
        status: 200 as const,
        body: {
          agentVersion: version?.agentVersion ?? "unknown",
          machineType: sandbox.machineType ?? "ec2",
          hostname: sandbox.name,
          os: {
            platform: version?.os ?? "linux",
            release: version?.agentVersion ?? "unknown",
            arch: version?.arch ?? "x64",
          },
          docker: {
            version: version?.dockerVersion ?? "unknown",
            containers: containers.map((c) => ({
              id: c.id,
              name: c.name,
              image: c.image,
              status: c.status,
              state: c.state,
              ports: c.ports,
              createdAt: c.createdAt,
              labels: c.labels,
            })),
          },
          workers: workers.map((w) => ({
            workerId: w.workerId,
            containerId: w.containerId,
            containerName: w.containerName,
            status: w.status,
            activeJobs: w.activeJobs,
            statusPort: w.statusPort,
            uptime: w.uptime,
            image: w.image,
          })),
          uptime: health.uptimeMs / 1000,
        },
      };
    } catch (err) {
      await auditLogService.log({
        sandboxId: sandbox.id,
        userId: request.userId,
        action: "agent_status",
        details: { endpoint: "agent-status" },
        ipAddress: request.ip,
        result: "failure",
        errorMessage: err instanceof Error ? err.message : "Agent unreachable",
      });
      return {
        status: 502 as const,
        body: {
          error: "AGENT_UNREACHABLE",
          message: err instanceof Error ? err.message : "Agent unreachable",
        },
      };
    }
  },

  getAgentVersion: async ({ params, request }) => {
    await adminOnly(request);
    const { sandboxService, sandboxProviderFactory, sandboxAgentClient, auditLogService } =
      request.diScope.cradle;

    const sandbox = await sandboxService.getById(params.id);
    const provider = sandboxProviderFactory.getProvider(sandbox);
    const agentUrl = provider.getAgentUrl(sandbox);

    try {
      const version = await sandboxAgentClient.getVersion(agentUrl);

      await auditLogService.log({
        sandboxId: sandbox.id,
        userId: request.userId,
        action: "agent_version",
        details: { endpoint: "agent-version" },
        ipAddress: request.ip,
        result: "success",
      });

      return { status: 200 as const, body: version };
    } catch (err) {
      return {
        status: 502 as const,
        body: {
          error: "AGENT_UNREACHABLE",
          message: err instanceof Error ? err.message : "Agent unreachable",
        },
      };
    }
  },

  listContainers: async ({ params, request }) => {
    await adminOnly(request);
    const { sandboxService, sandboxProviderFactory, sandboxAgentClient, auditLogService } =
      request.diScope.cradle;

    const sandbox = await sandboxService.getById(params.id);
    const provider = sandboxProviderFactory.getProvider(sandbox);
    const agentUrl = provider.getAgentUrl(sandbox);

    try {
      const containers = await sandboxAgentClient.getContainers(agentUrl);

      await auditLogService.log({
        sandboxId: sandbox.id,
        userId: request.userId,
        action: "list_containers",
        details: { count: containers.length },
        ipAddress: request.ip,
        result: "success",
      });

      return { status: 200 as const, body: { data: containers } };
    } catch (err) {
      return {
        status: 502 as const,
        body: {
          error: "AGENT_UNREACHABLE",
          message: err instanceof Error ? err.message : "Agent unreachable",
        },
      };
    }
  },

  listWorkers: async ({ params, request }) => {
    await adminOnly(request);
    const { sandboxService, sandboxProviderFactory, sandboxAgentClient, auditLogService } =
      request.diScope.cradle;

    const sandbox = await sandboxService.getById(params.id);
    const provider = sandboxProviderFactory.getProvider(sandbox);
    const agentUrl = provider.getAgentUrl(sandbox);

    try {
      const workers = await sandboxAgentClient.getWorkers(agentUrl);

      await auditLogService.log({
        sandboxId: sandbox.id,
        userId: request.userId,
        action: "list_workers",
        details: { count: workers.length },
        ipAddress: request.ip,
        result: "success",
      });

      return { status: 200 as const, body: { data: workers } };
    } catch (err) {
      return {
        status: 502 as const,
        body: {
          error: "AGENT_UNREACHABLE",
          message: err instanceof Error ? err.message : "Agent unreachable",
        },
      };
    }
  },

  // ─── Audit & History ───

  getAuditLog: async ({ params, query, request }) => {
    await adminOnly(request);
    const { sandboxService, auditLogService } = request.diScope.cradle;

    const sandbox = await sandboxService.getById(params.id);
    const result = await auditLogService.findBySandbox(sandbox.id, {
      page: query.page,
      pageSize: query.pageSize,
      action: query.action,
    });

    return {
      status: 200 as const,
      body: {
        data: result.data.map((entry) => ({
          id: entry.id,
          sandboxId: entry.sandboxId,
          userId: entry.userId,
          action: entry.action,
          details: entry.details,
          ipAddress: entry.ipAddress,
          userAgent: entry.userAgent,
          result: entry.result,
          errorMessage: entry.errorMessage,
          durationMs: entry.durationMs,
          createdAt: entry.createdAt,
        })),
        pagination: {
          page: query.page,
          pageSize: query.pageSize,
          total: result.total,
          totalPages: Math.ceil(result.total / query.pageSize),
        },
      },
    };
  },

  getDeployHistory: async ({ params, query, request }) => {
    await adminOnly(request);
    const { sandboxService, deployHistoryRepo } = request.diScope.cradle;

    const sandbox = await sandboxService.getById(params.id);
    const result = await deployHistoryRepo.findBySandbox(sandbox.id, {
      page: query.page,
      pageSize: query.pageSize,
    });

    return {
      status: 200 as const,
      body: {
        data: result.data.map((entry) => ({
          id: entry.id,
          sandboxId: entry.sandboxId,
          imageTag: entry.imageTag,
          commitSha: entry.commitSha,
          commitMessage: entry.commitMessage,
          branch: entry.branch,
          environment: entry.environment,
          status: entry.status,
          triggeredBy: entry.triggeredBy,
          deployStartedAt: entry.deployStartedAt,
          deployCompletedAt: entry.deployCompletedAt,
          deployDurationMs: entry.deployDurationMs,
          errorMessage: entry.errorMessage,
          createdAt: entry.createdAt,
        })),
        pagination: {
          page: query.page,
          pageSize: query.pageSize,
          total: result.total,
          totalPages: Math.ceil(result.total / query.pageSize),
        },
      },
    };
  },

  // ─── Deploy Management ───

  listDeploys: async ({ request }) => {
    await adminOnly(request);
    const { deployService } = request.diScope.cradle;
    const deploys = await deployService.list();
    return {
      status: 200 as const,
      body: {
        data: deploys.map(toDeployResponse),
      },
    };
  },

  triggerDeploy: async ({ params, request }) => {
    await adminOnly(request);
    const { deployService } = request.diScope.cradle;

    try {
      const deploy = await deployService.triggerDeploy(params.id);
      return {
        status: 200 as const,
        body: {
          deployId: deploy.id,
          status: deploy.status,
          sandboxes: deploy.sandboxes.map((s) => ({
            sandboxId: s.sandboxId,
            sandboxName: s.sandboxName,
            status: s.status,
            activeTaskCount: s.activeTaskCount,
            message: s.message ?? null,
          })),
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      if (message.includes("not found")) {
        throw AppError.notFound(message);
      }
      throw AppError.conflict(message);
    }
  },

  getDeployStatus: async ({ params, request }) => {
    await adminOnly(request);
    const { deployService } = request.diScope.cradle;
    const deploy = await deployService.getById(params.id);
    if (!deploy) throw AppError.notFound("Deploy not found");

    return {
      status: 200 as const,
      body: {
        id: deploy.id,
        imageTag: deploy.imageTag,
        commitSha: deploy.commitSha,
        commitMessage: deploy.commitMessage,
        branch: deploy.branch,
        environment: deploy.environment,
        status: deploy.status,
        sandboxes: deploy.sandboxes.map((s) => ({
          sandboxId: s.sandboxId,
          sandboxName: s.sandboxName,
          status: s.status,
          activeTaskCount: s.activeTaskCount,
          message: s.message ?? null,
        })),
        createdAt: new Date(deploy.createdAt),
        updatedAt: new Date(deploy.updatedAt),
      },
    };
  },

  cancelDeploy: async ({ params, request }) => {
    await adminOnly(request);
    const { deployService } = request.diScope.cradle;

    try {
      await deployService.cancelDeploy(params.id);
      return {
        status: 200 as const,
        body: { message: "Deploy cancelled" },
      };
    } catch (err) {
      throw AppError.notFound(err instanceof Error ? err.message : "Deploy not found");
    }
  },

  workerStatus: async ({ params, request }) => {
    await adminOnly(request);
    const { sandboxService, sandboxProviderFactory, taskRepo, ghosthandsClient, logger } =
      request.diScope.cradle;

    const sandbox = await sandboxService.getById(params.id);
    const provider = sandboxProviderFactory.getProvider(sandbox);

    // Get Docker container count from deploy-server health (EC2/macOS only — port 8000)
    // Kasm sandboxes run a single container without a deploy-server, so we skip this check
    let dockerContainers: number | null = null;
    if (provider.type !== "kasm") {
      try {
        const agentUrl = provider.getAgentUrl(sandbox);
        const deployResp = await fetch(`${agentUrl}/health`, {
          signal: AbortSignal.timeout(5_000),
        });
        if (deployResp.ok) {
          const deployBody = (await deployResp.json()) as Record<string, unknown>;
          let count = 1; // deploy-server is running (we got a response)
          if (deployBody.apiHealthy) count++;
          if (deployBody.workerStatus && deployBody.workerStatus !== "unknown") count++;
          dockerContainers = count;
        }
      } catch {
        logger.debug({ sandboxId: params.id }, "Deploy-server unreachable for container count");
      }
    } else {
      // Kasm: single container — if the agent responds, count it as 1
      try {
        const agentUrl = provider.getAgentUrl(sandbox);
        const resp = await fetch(`${agentUrl}/health`, {
          signal: AbortSignal.timeout(5_000),
        });
        if (resp.ok) dockerContainers = 1;
      } catch {
        logger.debug({ sandboxId: params.id }, "Kasm agent unreachable for container count");
      }
    }

    // Check GhostHands API health (graceful failure)
    let ghApiStatus: "healthy" | "unhealthy" | "unreachable" = "unreachable";
    try {
      const health = await ghosthandsClient.healthCheck();
      ghApiStatus = health.status === "ok" || health.status === "healthy" ? "healthy" : "unhealthy";
    } catch {
      logger.debug({ sandboxId: params.id }, "GhostHands API unreachable for worker status");
    }

    // Defaults for monitoring data
    let workerOverallStatus: "healthy" | "degraded" | "unhealthy" | "unreachable" = "unreachable";
    let ghVersion: string | null = null;
    let ghChecks: Array<{ name: string; status: string; message?: string; latencyMs?: number }> =
      [];
    let activeJobs: number | null = null;
    let maxConcurrent: number | null = null;
    let totalProcessed: number | null = null;
    let queueDepth: number | null = null;
    let jobStats = { created: 0, completed: 0, failed: 0 };
    let uptime: number | null = null;

    if (ghApiStatus !== "unreachable") {
      // Try detailed health endpoint (/monitoring/health)
      try {
        const detailedHealth = await ghosthandsClient.getDetailedHealth();
        ghVersion = detailedHealth.version ?? null;
        ghChecks = (detailedHealth.checks ?? []).map((c) => ({
          name: c.name,
          status: c.status,
          ...(c.message ? { message: c.message } : {}),
          ...(c.latencyMs != null ? { latencyMs: c.latencyMs } : {}),
        }));
        workerOverallStatus =
          detailedHealth.status === "ok" || detailedHealth.status === "healthy"
            ? "healthy"
            : detailedHealth.status === "degraded"
              ? "degraded"
              : "unhealthy";
      } catch {
        logger.debug(
          { sandboxId: params.id },
          "GH monitoring/health not available, using basic health",
        );
        workerOverallStatus = ghApiStatus === "healthy" ? "healthy" : "unhealthy";
      }

      // Try metrics endpoint (/monitoring/metrics/json)
      try {
        const metrics = await ghosthandsClient.getMetrics();
        activeJobs = metrics.worker.activeJobs;
        maxConcurrent = metrics.worker.maxConcurrent;
        totalProcessed = metrics.worker.totalProcessed;
        queueDepth = metrics.worker.queueDepth;
        jobStats = {
          created: metrics.jobs.created,
          completed: metrics.jobs.completed,
          failed: metrics.jobs.failed,
        };
        uptime = metrics.uptime;
      } catch {
        logger.debug({ sandboxId: params.id }, "GH monitoring/metrics not available");
      }
    }

    // Query active and recent tasks for this sandbox
    const activeTasks = await taskRepo.findActiveBySandbox(request.userId, sandbox.id);
    const recentTasks = await taskRepo.findRecentBySandbox(request.userId, sandbox.id);

    return {
      status: 200 as const,
      body: {
        sandboxId: sandbox.id,
        ghosthandsApi: { status: ghApiStatus, version: ghVersion },
        worker: {
          status: workerOverallStatus,
          activeJobs,
          maxConcurrent,
          totalProcessed,
          queueDepth,
        },
        ghChecks,
        jobStats,
        dockerContainers,
        uptime,
        activeTasks: activeTasks.map((t) => ({
          taskId: t.id,
          jobUrl: t.jobUrl,
          status: t.status,
          progress: t.progress,
          currentStep: t.currentStep,
          createdAt: t.createdAt,
        })),
        recentTasks: recentTasks.map((t) => ({
          taskId: t.id,
          jobUrl: t.jobUrl,
          status: t.status,
          completedAt: t.completedAt,
        })),
      },
    };
  },
});

function toDeployResponse(d: DeployRecord) {
  return {
    id: d.id,
    imageTag: d.imageTag,
    commitSha: d.commitSha,
    commitMessage: d.commitMessage,
    branch: d.branch,
    environment: d.environment,
    repository: d.repository,
    runUrl: d.runUrl,
    status: d.status,
    sandboxes: (d.sandboxes ?? []).map((s) => ({
      sandboxId: s.sandboxId,
      sandboxName: s.sandboxName,
      status: s.status,
      activeTaskCount: s.activeTaskCount,
      message: s.message ?? null,
    })),
    createdAt: new Date(d.createdAt),
    updatedAt: new Date(d.updatedAt),
  };
}
