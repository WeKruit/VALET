import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

const GH_SERVICE_SECRET = "test-service-secret";

function createMocks() {
  return {
    taskRepo: {
      findByIdAdmin: vi.fn(),
      findByWorkflowRunId: vi.fn(),
      updateStatusGuarded: vi.fn(),
      updateGhosthandsResult: vi.fn(),
      updateLlmUsage: vi.fn(),
      updateInteractionData: vi.fn(),
      clearInteractionData: vi.fn(),
    },
    ghJobRepo: {
      findById: vi.fn(),
      updateStatusIfNotTerminal: vi.fn(),
      updateFields: vi.fn(),
    },
    redis: {
      publish: vi.fn().mockResolvedValue(1),
      xadd: vi.fn().mockResolvedValue("1-0"),
      expire: vi.fn().mockResolvedValue(1),
    },
    sandboxRepo: {
      findById: vi.fn(),
    },
    referralService: {
      activateReferral: vi.fn().mockResolvedValue(null),
      updateRewardCreditsIssued: vi.fn(),
    },
    creditService: {
      grantCredits: vi.fn(),
    },
  };
}

async function buildApp(mocks: ReturnType<typeof createMocks>): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorateRequest("diScope", null);
  app.addHook("onRequest", async (request) => {
    (request as any).diScope = { cradle: mocks };
  });

  process.env.GH_SERVICE_SECRET = GH_SERVICE_SECRET;
  process.env.FEATURE_REFERRALS = "false";
  process.env.FEATURE_CREDITS_ENFORCEMENT = "false";

  const { ghosthandsWebhookRoute } =
    await import("../../src/modules/ghosthands/ghosthands.webhook.js");
  await app.register(ghosthandsWebhookRoute);
  await app.ready();
  return app;
}

describe("ghosthands webhook terminal metadata merge", () => {
  let app: FastifyInstance;
  let mocks: ReturnType<typeof createMocks>;

  beforeAll(async () => {
    mocks = createMocks();
    app = await buildApp(mocks);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.taskRepo.findByIdAdmin.mockResolvedValue({
      id: "task-1",
      userId: "user-1",
      status: "in_progress",
      sandboxId: null,
    });
    mocks.taskRepo.updateStatusGuarded.mockResolvedValue({
      id: "task-1",
      userId: "user-1",
      status: "completed",
      sandboxId: null,
    });
  });

  it("merges cost/result metadata onto matching terminal gh rows", async () => {
    mocks.ghJobRepo.updateStatusIfNotTerminal.mockResolvedValue(null);
    mocks.ghJobRepo.findById.mockResolvedValue({
      id: "gh-job-1",
      status: "completed",
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/webhooks/ghosthands",
      headers: {
        "content-type": "application/json",
        "x-gh-service-key": GH_SERVICE_SECRET,
      },
      payload: JSON.stringify({
        job_id: "gh-job-1",
        valet_task_id: "task-1",
        status: "completed",
        result_summary: "Applied successfully",
        result_data: {
          applied: true,
        },
        cost: {
          total_cost_usd: 0.0342,
          action_count: 15,
          total_tokens: 4500,
        },
        cost_breakdown: {
          llm: 0.02,
          browser: 0.0142,
        },
      }),
    });

    expect(response.statusCode).toBe(200);
    expect(mocks.ghJobRepo.updateFields).toHaveBeenCalledWith(
      "gh-job-1",
      expect.objectContaining({
        resultSummary: "Applied successfully",
        resultData: { applied: true, summary: "Applied successfully", screenshot_url: undefined },
        llmCostCents: 3,
        totalTokens: 4500,
        actionCount: 15,
        metadata: {
          cost_breakdown: {
            llm: 0.02,
            browser: 0.0142,
          },
        },
      }),
    );
  });
});
