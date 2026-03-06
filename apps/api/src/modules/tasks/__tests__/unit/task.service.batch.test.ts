import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TaskService } from "../../task.service.js";
import { AppError } from "@valet/shared/errors";

// ── Helpers ──

function makeMockLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn().mockReturnThis(),
    level: "info",
    silent: vi.fn(),
  };
}

function makeMockCreditService(balance = 100) {
  return {
    getBalance: vi.fn().mockResolvedValue({ balance, trialExpiry: null, enforcementEnabled: true }),
    debitForTask: vi.fn().mockResolvedValue({ success: true, balance: balance - 1 }),
    refundTask: vi.fn().mockResolvedValue({ balance: balance + 1 }),
    grantCredits: vi.fn(),
    getLedger: vi.fn(),
  };
}

function makeMinimalDeps(overrides: Record<string, unknown> = {}) {
  return {
    taskRepo: { create: vi.fn() },
    userRepo: { findById: vi.fn() },
    resumeRepo: { findById: vi.fn(), findByUserId: vi.fn().mockResolvedValue([]) },
    qaBankRepo: {},
    ghosthandsClient: { submitApplication: vi.fn() },
    ghJobRepo: { create: vi.fn(), findByTaskId: vi.fn() },
    ghJobEventRepo: {},
    ghSessionRepo: {},
    taskQueueService: { enqueueApplyJob: vi.fn() },
    redis: { publish: vi.fn() },
    logger: makeMockLogger(),
    sandboxRepo: { findById: vi.fn() },
    userSandboxRepo: { findByUserId: vi.fn().mockResolvedValue(null) },
    atmFleetClient: { resolveFleetId: vi.fn() },
    submissionProofRepo: {},
    creditService: makeMockCreditService(),
    ...overrides,
  };
}

const BATCH_BASE = {
  resumeId: "00000000-0000-0000-0000-000000000001",
  mode: "copilot" as const,
  executionTarget: "cloud" as const,
};

const ADMIN_USER_ID = "user-1";
const ADMIN_ROLE = "admin";

let taskCounter = 0;

/** Spy on service.create to return fake tasks without exercising internal deps. */
function stubCreateMethod(service: TaskService) {
  return vi.spyOn(service, "create").mockImplementation(async () => {
    const id = `task-${++taskCounter}`;
    return { id, status: "created" } as never;
  });
}

describe("TaskService.createBatch()", () => {
  let deps: ReturnType<typeof makeMinimalDeps>;
  let service: TaskService;

  beforeEach(() => {
    taskCounter = 0;
    deps = makeMinimalDeps();
    service = new TaskService(deps as never);
    vi.stubEnv("FEATURE_CREDITS_ENFORCEMENT", "false");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  // ── All URLs succeed ──

  it("creates a task for each unique URL and returns created status", async () => {
    stubCreateMethod(service);

    const result = await service.createBatch(
      { ...BATCH_BASE, jobUrls: ["https://example.com/job/1", "https://example.com/job/2"] },
      ADMIN_USER_ID,
      ADMIN_ROLE,
    );

    expect(result.summary.total).toBe(2);
    expect(result.summary.created).toBe(2);
    expect(result.summary.failed).toBe(0);
    expect(result.summary.duplicates).toBe(0);
    expect(result.summary.skipped).toBe(0);
    expect(result.results).toHaveLength(2);
    expect(result.results[0]!.status).toBe("created");
    expect(result.results[0]!.taskId).toBeDefined();
    expect(result.results[1]!.status).toBe("created");
  });

  // ── Upfront 402 rejection (enforcement on, insufficient balance) ──

  it("rejects the whole batch with 402 when enforcement is on and balance is insufficient", async () => {
    vi.stubEnv("FEATURE_CREDITS_ENFORCEMENT", "true");
    (deps.creditService.getBalance as ReturnType<typeof vi.fn>).mockResolvedValue({
      balance: 1,
      trialExpiry: null,
      enforcementEnabled: true,
    });

    await expect(
      service.createBatch(
        { ...BATCH_BASE, jobUrls: ["https://a.com/1", "https://b.com/2", "https://c.com/3"] },
        ADMIN_USER_ID,
        ADMIN_ROLE,
      ),
    ).rejects.toThrow(AppError);

    await expect(
      service.createBatch(
        { ...BATCH_BASE, jobUrls: ["https://a.com/1", "https://b.com/2", "https://c.com/3"] },
        ADMIN_USER_ID,
        ADMIN_ROLE,
      ),
    ).rejects.toThrow(/Insufficient credits/);

    // No tasks should have been created
    expect(deps.taskRepo.create).not.toHaveBeenCalled();
  });

  it("allows batch when enforcement is on and balance is sufficient", async () => {
    vi.stubEnv("FEATURE_CREDITS_ENFORCEMENT", "true");
    stubCreateMethod(service);

    const result = await service.createBatch(
      { ...BATCH_BASE, jobUrls: ["https://a.com/1", "https://b.com/2"] },
      ADMIN_USER_ID,
      ADMIN_ROLE,
    );

    expect(result.summary.created).toBe(2);
  });

  // ── Per-item validation failure (partial success) ──

  it("continues on AppError (expected error) and reports per-item failure", async () => {
    let callCount = 0;
    vi.spyOn(service, "create").mockImplementation(async () => {
      callCount++;
      if (callCount === 2) {
        throw AppError.badRequest("Invalid job URL format");
      }
      return { id: `task-${callCount}`, status: "created" } as never;
    });

    const result = await service.createBatch(
      { ...BATCH_BASE, jobUrls: ["https://a.com/1", "https://b.com/2", "https://c.com/3"] },
      ADMIN_USER_ID,
      ADMIN_ROLE,
    );

    expect(result.summary.created).toBe(2);
    expect(result.summary.failed).toBe(1);
    expect(result.results[1]!.status).toBe("failed");
    expect(result.results[1]!.error).toMatch(/Invalid job URL/);
    // Third URL should still succeed
    expect(result.results[2]!.status).toBe("created");
  });

  // ── Duplicate URL dedup ──

  it("deduplicates normalized URLs within the same batch", async () => {
    stubCreateMethod(service);

    const result = await service.createBatch(
      {
        ...BATCH_BASE,
        jobUrls: [
          "https://example.com/job/1",
          "https://EXAMPLE.COM/job/1", // same after normalization (host lowercased)
          "https://example.com/job/2",
        ],
      },
      ADMIN_USER_ID,
      ADMIN_ROLE,
    );

    expect(result.summary.total).toBe(3);
    expect(result.summary.created).toBe(2);
    expect(result.summary.duplicates).toBe(1);
    expect(result.results[1]!.status).toBe("duplicate");
    expect(result.results[1]!.error).toMatch(/Duplicate/i);
  });

  it("deduplicates URLs that differ only by trailing slash", async () => {
    stubCreateMethod(service);

    const result = await service.createBatch(
      {
        ...BATCH_BASE,
        jobUrls: ["https://example.com/job/1/", "https://example.com/job/1"],
      },
      ADMIN_USER_ID,
      ADMIN_ROLE,
    );

    expect(result.summary.created).toBe(1);
    expect(result.summary.duplicates).toBe(1);
  });

  // ── Mid-batch infrastructure error (remaining skipped) ──

  it("aborts remaining URLs on non-AppError infrastructure error", async () => {
    let callCount = 0;
    vi.spyOn(service, "create").mockImplementation(async () => {
      callCount++;
      if (callCount === 2) {
        throw new Error("Connection refused");
      }
      return { id: `task-${callCount}`, status: "created" } as never;
    });

    const result = await service.createBatch(
      {
        ...BATCH_BASE,
        jobUrls: ["https://a.com/1", "https://b.com/2", "https://c.com/3", "https://d.com/4"],
      },
      ADMIN_USER_ID,
      ADMIN_ROLE,
    );

    expect(result.summary.created).toBe(1);
    expect(result.summary.failed).toBe(1);
    expect(result.summary.skipped).toBe(2);
    expect(result.results[1]!.status).toBe("failed");
    expect(result.results[1]!.error).toMatch(/Connection refused/);
    expect(result.results[2]!.status).toBe("skipped");
    expect(result.results[3]!.status).toBe("skipped");
  });

  // ── Balance snapshot after batch ──

  it("includes balanceAfter in the response", async () => {
    stubCreateMethod(service);
    (deps.creditService.getBalance as ReturnType<typeof vi.fn>).mockResolvedValue({
      balance: 42,
      trialExpiry: null,
      enforcementEnabled: false,
    });

    const result = await service.createBatch(
      { ...BATCH_BASE, jobUrls: ["https://example.com/job/1"] },
      ADMIN_USER_ID,
      ADMIN_ROLE,
    );

    expect(result.balanceAfter).toBe(42);
  });

  it("returns null balanceAfter when getBalance throws", async () => {
    stubCreateMethod(service);
    (deps.creditService.getBalance as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("DB down"),
    );

    const result = await service.createBatch(
      { ...BATCH_BASE, jobUrls: ["https://example.com/job/1"] },
      ADMIN_USER_ID,
      ADMIN_ROLE,
    );

    expect(result.balanceAfter).toBeNull();
  });

  // ── Enforcement off skips credit check ──

  it("does not check balance when enforcement is off", async () => {
    stubCreateMethod(service);
    vi.stubEnv("FEATURE_CREDITS_ENFORCEMENT", "false");
    (deps.creditService.getBalance as ReturnType<typeof vi.fn>).mockResolvedValue({
      balance: 0,
      trialExpiry: null,
      enforcementEnabled: false,
    });

    // Should succeed even with 0 balance
    const result = await service.createBatch(
      { ...BATCH_BASE, jobUrls: ["https://a.com/1"] },
      ADMIN_USER_ID,
      ADMIN_ROLE,
    );

    expect(result.summary.created).toBe(1);
  });
});
