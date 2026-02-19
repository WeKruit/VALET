import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuditLogService } from "../../../audit-log.service.js";
import type { AuditLogRepository } from "../../../audit-log.repository.js";

function makeMockRepo() {
  return {
    insert: vi.fn<(entry: Record<string, unknown>) => Promise<void>>().mockResolvedValue(undefined),
    findBySandbox: vi.fn().mockResolvedValue({ data: [], total: 0 }),
  };
}

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

describe("AuditLogService", () => {
  let service: AuditLogService;
  let repo: ReturnType<typeof makeMockRepo>;
  let logger: ReturnType<typeof makeMockLogger>;

  beforeEach(() => {
    repo = makeMockRepo();
    logger = makeMockLogger();
    service = new AuditLogService({
      auditLogRepo: repo as unknown as AuditLogRepository,
      logger: logger as never,
    });
  });

  describe("log()", () => {
    it("should insert an audit log entry with all fields", async () => {
      await service.log({
        sandboxId: "sandbox-1",
        userId: "user-1",
        action: "start",
        details: { reason: "manual" },
        ipAddress: "192.168.1.1",
        userAgent: "Mozilla/5.0",
        result: "success",
        durationMs: 1500,
      });

      expect(repo.insert).toHaveBeenCalledOnce();
      expect(repo.insert).toHaveBeenCalledWith({
        sandboxId: "sandbox-1",
        userId: "user-1",
        action: "start",
        details: { reason: "manual" },
        ipAddress: "192.168.1.1",
        userAgent: "Mozilla/5.0",
        result: "success",
        errorMessage: undefined,
        durationMs: 1500,
      });
    });

    it("should default result to 'success' when not provided", async () => {
      await service.log({
        sandboxId: "sandbox-1",
        action: "stop",
      });

      expect(repo.insert).toHaveBeenCalledOnce();
      const call = repo.insert.mock.calls[0]![0] as Record<string, unknown>;
      expect(call.result).toBe("success");
    });

    it("should handle optional fields as undefined", async () => {
      await service.log({
        sandboxId: "sandbox-1",
        action: "deploy",
      });

      expect(repo.insert).toHaveBeenCalledOnce();
      const call = repo.insert.mock.calls[0]![0] as Record<string, unknown>;
      expect(call.userId).toBeUndefined();
      expect(call.ipAddress).toBeUndefined();
      expect(call.userAgent).toBeUndefined();
      expect(call.durationMs).toBeUndefined();
    });

    it("should log error and not throw when insert fails", async () => {
      repo.insert.mockRejectedValueOnce(new Error("DB connection lost"));

      await expect(
        service.log({
          sandboxId: "sandbox-1",
          action: "start",
        }),
      ).resolves.not.toThrow();

      expect(logger.error).toHaveBeenCalledOnce();
    });

    it("should pass error details when result is failure", async () => {
      await service.log({
        sandboxId: "sandbox-1",
        action: "deploy",
        result: "failure",
        errorMessage: "Image pull failed",
        durationMs: 30000,
      });

      expect(repo.insert).toHaveBeenCalledOnce();
      const call = repo.insert.mock.calls[0]![0] as Record<string, unknown>;
      expect(call.result).toBe("failure");
      expect(call.errorMessage).toBe("Image pull failed");
      expect(call.durationMs).toBe(30000);
    });
  });

  describe("findBySandbox()", () => {
    it("should delegate to repository with correct params", async () => {
      const mockResult = {
        data: [
          {
            id: "log-1",
            sandboxId: "sandbox-1",
            action: "start",
            createdAt: new Date(),
          },
        ],
        total: 1,
      };
      repo.findBySandbox.mockResolvedValueOnce(mockResult);

      const result = await service.findBySandbox("sandbox-1", {
        page: 1,
        pageSize: 20,
      });

      expect(repo.findBySandbox).toHaveBeenCalledWith("sandbox-1", {
        page: 1,
        pageSize: 20,
      });
      expect(result).toEqual(mockResult);
    });

    it("should pass action filter when provided", async () => {
      repo.findBySandbox.mockResolvedValueOnce({ data: [], total: 0 });

      await service.findBySandbox("sandbox-1", {
        page: 1,
        pageSize: 10,
        action: "deploy",
      });

      expect(repo.findBySandbox).toHaveBeenCalledWith("sandbox-1", {
        page: 1,
        pageSize: 10,
        action: "deploy",
      });
    });
  });
});
