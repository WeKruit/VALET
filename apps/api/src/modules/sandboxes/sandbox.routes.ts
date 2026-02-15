import { initServer } from "@ts-rest/fastify";
import { sandboxContract } from "@valet/contracts";
import { adminOnly } from "../../common/middleware/admin.js";
import { AppError } from "../../common/errors.js";

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

    // Get worker info from sandbox metrics (best effort)
    let hatchetConnected: boolean | null = null;
    let adspowerStatus: string | null = null;
    try {
      const metrics = await sandboxService.getMetrics(params.id);
      hatchetConnected = metrics.hatchetConnected;
      adspowerStatus = metrics.adspowerStatus;
    } catch {
      // Metrics may fail if EC2 is not running
    }

    // Query active and recent tasks for this sandbox
    const activeTasks = await taskRepo.findActiveBySandbox(request.userId, sandbox.id);
    const recentTasks = await taskRepo.findRecentBySandbox(request.userId, sandbox.id);

    return {
      status: 200 as const,
      body: {
        sandboxId: sandbox.id,
        ghosthandsApi: { status: ghApiStatus },
        worker: { hatchetConnected, adspowerStatus },
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
