import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

type RouteHandler = (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>;

vi.mock("../../src/common/middleware/admin.js", () => ({ adminOnly: vi.fn().mockResolvedValue(undefined) }));

const mockFleet = { workers: [
  { worker_id: "sandbox-uuid-1", status: "active" as const, target_worker_id: null, ec2_instance_id: "i-abc", ec2_ip: "1.2.3.4", current_job_id: "job-1", registered_at: "2026-02-01T00:00:00Z", last_heartbeat: "2026-02-19T12:00:00Z", jobs_completed: 10, jobs_failed: 2, uptime_seconds: 86400 },
  { worker_id: "sandbox-uuid-2", status: "draining" as const, target_worker_id: "sandbox-uuid-2", ec2_instance_id: "i-def", ec2_ip: "5.6.7.8", current_job_id: null, registered_at: "2026-02-10T00:00:00Z", last_heartbeat: "2026-02-19T11:00:00Z", jobs_completed: 5, jobs_failed: 0, uptime_seconds: 3600 },
]};
const mockSandboxes = [{ id: "sandbox-uuid-1", name: "sandbox-prod-1", environment: "production" }, { id: "sandbox-uuid-2", name: "sandbox-stg-1", environment: "staging" }];
const mockGh = { getWorkerFleet: vi.fn().mockResolvedValue(mockFleet), getWorkerStatus: vi.fn().mockResolvedValue({ worker_id: "sandbox-uuid-1", active_jobs: 1 }), getWorkerHealth: vi.fn().mockResolvedValue({ status: "busy" }), drainWorker: vi.fn().mockResolvedValue(undefined), deregisterWorker: vi.fn().mockResolvedValue({ deregistered: ["sandbox-uuid-1"], cancelled_jobs: ["job-1"], reason: "admin_deregister" }) };
const mockSbRepo = { findAllActive: vi.fn().mockResolvedValue(mockSandboxes) };
const mockLog = { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() } as unknown as FastifyRequest["log"];

function mkReq(o: Record<string, unknown> = {}): unknown { return { diScope: { cradle: { ghosthandsClient: mockGh, sandboxRepo: mockSbRepo } }, log: mockLog, ...o }; }
function mkReply(): unknown { const r = { _sc: 200, _b: null as unknown, status(c: number) { r._sc = c; return r; }, send(b: unknown) { r._b = b; return r; } }; return r; }

let routes: Map<string, RouteHandler>;
async function setup() {
  routes = new Map();
  const f = { get: vi.fn((p: string, h: RouteHandler) => routes.set("GET:" + p, h)), post: vi.fn((p: string, h: RouteHandler) => routes.set("POST:" + p, h)) } as unknown as FastifyInstance;
  const { workerAdminRoutes } = await import("../../src/modules/ghosthands/worker.admin-routes.js");
  await workerAdminRoutes(f);
}

describe("Worker Admin Routes", () => {
  beforeEach(async () => { vi.clearAllMocks(); await setup(); });

  it("GET list returns enriched workers", async () => {
    const h = routes.get("GET:/api/v1/admin/workers")!;
    const rp = mkReply() as unknown as FastifyReply & { _b: unknown };
    await h(mkReq() as unknown as FastifyRequest, rp);
    const b = rp._b as { workers: unknown[]; total: number };
    expect(b.total).toBe(2);
    expect(b.workers).toHaveLength(2);
  });

  it("GET list enriches with sandbox info", async () => {
    const rp = mkReply() as unknown as FastifyReply & { _b: unknown };
    await routes.get("GET:/api/v1/admin/workers")!(mkReq() as unknown as FastifyRequest, rp);
    const b = rp._b as { workers: Array<{ sandbox_name: string }> };
    expect(b.workers[0]!.sandbox_name).toBe("sandbox-prod-1");
  });

  it("GET list returns 502 on GH error", async () => {
    mockGh.getWorkerFleet.mockRejectedValueOnce(new Error("timeout"));
    const rp = mkReply() as unknown as FastifyReply & { _b: unknown; _sc: number };
    await routes.get("GET:/api/v1/admin/workers")!(mkReq() as unknown as FastifyRequest, rp);
    expect(rp._sc).toBe(502);
  });

  it("GET detail returns worker with live status", async () => {
    const rp = mkReply() as unknown as FastifyReply & { _b: unknown };
    await routes.get("GET:/api/v1/admin/workers/:workerId")!(mkReq({ params: { workerId: "sandbox-uuid-1" } }) as unknown as FastifyRequest, rp);
    const b = rp._b as { worker_id: string; live_status: unknown };
    expect(b.worker_id).toBe("sandbox-uuid-1");
    expect(b.live_status).toBeTruthy();
  });

  it("GET detail returns 404 for unknown worker", async () => {
    const rp = mkReply() as unknown as FastifyReply & { _sc: number };
    await routes.get("GET:/api/v1/admin/workers/:workerId")!(mkReq({ params: { workerId: "unknown" } }) as unknown as FastifyRequest, rp);
    expect(rp._sc).toBe(404);
  });

  it("GET detail graceful when live status fails", async () => {
    mockGh.getWorkerStatus.mockRejectedValueOnce(new Error("t"));
    mockGh.getWorkerHealth.mockRejectedValueOnce(new Error("t"));
    const rp = mkReply() as unknown as FastifyReply & { _b: unknown };
    await routes.get("GET:/api/v1/admin/workers/:workerId")!(mkReq({ params: { workerId: "sandbox-uuid-1" } }) as unknown as FastifyRequest, rp);
    expect((rp._b as { live_status: unknown }).live_status).toBeNull();
  });

  it("POST drain works", async () => {
    const rp = mkReply() as unknown as FastifyReply & { _b: unknown };
    await routes.get("POST:/api/v1/admin/workers/:workerId/drain")!(mkReq({ params: { workerId: "sandbox-uuid-1" } }) as unknown as FastifyRequest, rp);
    expect(mockGh.drainWorker).toHaveBeenCalled();
  });

  it("POST drain 404 for unknown", async () => {
    const rp = mkReply() as unknown as FastifyReply & { _sc: number };
    await routes.get("POST:/api/v1/admin/workers/:workerId/drain")!(mkReq({ params: { workerId: "unknown" } }) as unknown as FastifyRequest, rp);
    expect(rp._sc).toBe(404);
  });

  it("POST deregister with params", async () => {
    const rp = mkReply() as unknown as FastifyReply & { _b: unknown };
    await routes.get("POST:/api/v1/admin/workers/:workerId/deregister")!(mkReq({ params: { workerId: "sandbox-uuid-1" }, body: { reason: "maint" } }) as unknown as FastifyRequest, rp);
    expect(mockGh.deregisterWorker).toHaveBeenCalledWith(expect.objectContaining({ reason: "maint" }));
  });

  it("POST deregister default reason", async () => {
    const rp = mkReply() as unknown as FastifyReply & { _b: unknown };
    await routes.get("POST:/api/v1/admin/workers/:workerId/deregister")!(mkReq({ params: { workerId: "sandbox-uuid-1" }, body: {} }) as unknown as FastifyRequest, rp);
    expect(mockGh.deregisterWorker).toHaveBeenCalledWith(expect.objectContaining({ reason: "admin_deregister" }));
  });
});
