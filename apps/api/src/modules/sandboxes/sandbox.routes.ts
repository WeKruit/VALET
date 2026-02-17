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
    await sandboxService.terminate(params.id);
    return { status: 204, body: undefined };
  },

  healthCheck: async ({ params, request }) => {
    await adminOnly(request);
    const { sandboxService } = request.diScope.cradle;
    const result = await sandboxService.healthCheck(params.id);
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
    const result = await sandboxService.getEc2Status(params.id);
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
    const { sandboxService, taskRepo, ghosthandsClient, logger } = request.diScope.cradle;

    const sandbox = await sandboxService.getById(params.id);

    // Check GhostHands API health (graceful failure)
    let ghApiStatus: "healthy" | "unhealthy" | "unreachable" = "unreachable";
    try {
      const health = await ghosthandsClient.healthCheck();
      ghApiStatus = health.status === "ok" || health.status === "healthy" ? "healthy" : "unhealthy";
    } catch {
      logger.debug({ sandboxId: params.id }, "GhostHands API unreachable for worker status");
    }

    // Get richer worker data from GH monitoring endpoints (graceful fallback)
    let activeWorkers: number | null = null;
    let queueDepth: number | null = null;
    let workerOverallStatus: "healthy" | "degraded" | "unhealthy" | "unreachable" = "unreachable";

    if (ghApiStatus !== "unreachable") {
      // Try detailed health endpoint first
      try {
        const detailedHealth = await ghosthandsClient.getDetailedHealth();
        activeWorkers = detailedHealth.active_workers ?? null;
        workerOverallStatus =
          detailedHealth.status === "ok" || detailedHealth.status === "healthy"
            ? "healthy"
            : detailedHealth.status === "degraded"
              ? "degraded"
              : "unhealthy";
      } catch {
        // Monitoring endpoint may not be deployed; fall back to basic health
        logger.debug(
          { sandboxId: params.id },
          "GH monitoring/health not available, using basic health",
        );
        workerOverallStatus = ghApiStatus === "healthy" ? "healthy" : "unhealthy";
      }

      // Try metrics endpoint for queue depth
      try {
        const metrics = await ghosthandsClient.getMetrics();
        queueDepth = metrics.queue_depth ?? null;
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
        ghosthandsApi: { status: ghApiStatus },
        worker: { status: workerOverallStatus, activeWorkers, queueDepth },
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
    createdAt: new Date(d.createdAt),
    updatedAt: new Date(d.updatedAt),
  };
}
