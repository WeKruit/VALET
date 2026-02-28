import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

type RouteHandler = (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>;

vi.mock("../../src/common/middleware/admin.js", () => ({
  adminOnly: vi.fn().mockResolvedValue(undefined),
}));

const mockFleet = {
  workers: [
    {
      worker_id: "sandbox-uuid-1",
      status: "active" as const,
      target_worker_id: null,
      ec2_instance_id: "i-abc",
      ec2_ip: "1.2.3.4",
      current_job_id: "job-1",
      registered_at: "2026-02-01T00:00:00Z",
      last_heartbeat: "2026-02-19T12:00:00Z",
      jobs_completed: 10,
      jobs_failed: 2,
      uptime_seconds: 86400,
    },
    {
      worker_id: "sandbox-uuid-2",
      status: "draining" as const,
      target_worker_id: "sandbox-uuid-2",
      ec2_instance_id: "i-def",
      ec2_ip: "5.6.7.8",
      current_job_id: null,
      registered_at: "2026-02-10T00:00:00Z",
      last_heartbeat: "2026-02-19T11:00:00Z",
      jobs_completed: 5,
      jobs_failed: 0,
      uptime_seconds: 3600,
    },
  ],
};
const mockSandboxes = [
  { id: "sandbox-uuid-1", name: "sandbox-prod-1", environment: "production" },
  { id: "sandbox-uuid-2", name: "sandbox-stg-1", environment: "staging" },
];
const mockWorkerStatus = { worker_id: "sandbox-uuid-1", status: "idle", current_job: null };
const mockWorkerHealth = { healthy: true, uptime_seconds: 86400 };
const mockGh = {
  getWorkerFleet: vi.fn().mockResolvedValue(mockFleet),
  getWorkerStatus: vi.fn().mockResolvedValue(mockWorkerStatus),
  getWorkerHealth: vi.fn().mockResolvedValue(mockWorkerHealth),
  deregisterWorker: vi.fn().mockResolvedValue({
    deregistered: ["sandbox-uuid-1"],
    cancelled_jobs: ["job-1"],
    reason: "admin_deregister",
  }),
};
const mockSbRepo = { findAllActive: vi.fn().mockResolvedValue(mockSandboxes) };
const mockGhJobRepo = {
  findByIds: vi.fn().mockResolvedValue([{ id: "job-1", valetTaskId: "valet-task-abc" }]),
};
const mockAtmIdleStatus = {
  enabled: true,
  workers: [
    {
      serverId: "gh-worker-1",
      ip: "10.0.0.1",
      instanceId: "i-atm-abc123",
      ec2State: "running",
      activeJobs: 1,
      idleSinceMs: 0,
      transitioning: false,
    },
    {
      serverId: "gh-worker-2",
      ip: "",
      instanceId: "i-atm-def456",
      ec2State: "stopped",
      activeJobs: 0,
      idleSinceMs: 300000,
      transitioning: false,
    },
  ],
};
const mockAtmSandboxes = [
  {
    id: "sandbox-atm-1",
    name: "atm-prod-worker",
    environment: "production",
    instanceId: "i-atm-abc123",
    tags: { atm_fleet_id: "gh-worker-1" },
  },
  {
    id: "sandbox-atm-2",
    name: "atm-stg-worker",
    environment: "staging",
    instanceId: "i-atm-def456",
    tags: { atm_fleet_id: "gh-worker-2" },
  },
];
const mockAtmFleetClient = {
  isConfigured: false,
  getIdleStatus: vi.fn().mockResolvedValue(mockAtmIdleStatus),
  getWorkerHealth: vi.fn().mockResolvedValue({ status: "healthy" }),
};
const mockLog = {
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
} as unknown as FastifyRequest["log"];

function mkReq(o: Record<string, unknown> = {}): unknown {
  return {
    diScope: {
      cradle: {
        ghosthandsClient: mockGh,
        sandboxRepo: mockSbRepo,
        ghJobRepo: mockGhJobRepo,
        atmFleetClient: mockAtmFleetClient,
      },
    },
    log: mockLog,
    ...o,
  };
}
function mkReply(): unknown {
  const r = {
    _sc: 200,
    _b: null as unknown,
    status(c: number) {
      r._sc = c;
      return r;
    },
    send(b: unknown) {
      r._b = b;
      return r;
    },
  };
  return r;
}

let routes: Map<string, RouteHandler>;
async function setup() {
  routes = new Map();
  const f = {
    get: vi.fn((p: string, h: RouteHandler) => routes.set("GET:" + p, h)),
    post: vi.fn((p: string, h: RouteHandler) => routes.set("POST:" + p, h)),
  } as unknown as FastifyInstance;
  const { workerAdminRoutes } = await import("../../src/modules/ghosthands/worker.admin-routes.js");
  await workerAdminRoutes(f);
}

describe("Worker Admin Routes", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await setup();
  });

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

  it("GET list enriches with valet_task_id from gh_automation_jobs", async () => {
    const rp = mkReply() as unknown as FastifyReply & { _b: unknown };
    await routes.get("GET:/api/v1/admin/workers")!(mkReq() as unknown as FastifyRequest, rp);
    const b = rp._b as {
      workers: Array<{ worker_id: string; valet_task_id: string | null }>;
    };
    // Worker with current_job_id "job-1" should resolve to "valet-task-abc"
    expect(b.workers[0]!.valet_task_id).toBe("valet-task-abc");
    // Worker with no current_job_id should have null valet_task_id
    expect(b.workers[1]!.valet_task_id).toBeNull();
  });

  it("GET list returns 502 on GH error", async () => {
    mockGh.getWorkerFleet.mockRejectedValueOnce(new Error("timeout"));
    const rp = mkReply() as unknown as FastifyReply & { _b: unknown; _sc: number };
    await routes.get("GET:/api/v1/admin/workers")!(mkReq() as unknown as FastifyRequest, rp);
    expect(rp._sc).toBe(502);
  });

  it("GET detail returns worker data with live status", async () => {
    const rp = mkReply() as unknown as FastifyReply & { _b: unknown };
    await routes.get("GET:/api/v1/admin/workers/:workerId")!(
      mkReq({ params: { workerId: "sandbox-uuid-1" } }) as unknown as FastifyRequest,
      rp,
    );
    const b = rp._b as {
      worker_id: string;
      sandbox_name: string;
      live_status: unknown;
      live_health: unknown;
    };
    expect(b.worker_id).toBe("sandbox-uuid-1");
    expect(b.sandbox_name).toBe("sandbox-prod-1");
    expect(b.live_status).toEqual(mockWorkerStatus);
    expect(b.live_health).toEqual(mockWorkerHealth);
    expect(mockGh.getWorkerStatus).toHaveBeenCalledWith("sandbox-uuid-1");
    expect(mockGh.getWorkerHealth).toHaveBeenCalledWith("sandbox-uuid-1");
  });

  it("GET detail returns 404 for unknown worker", async () => {
    const rp = mkReply() as unknown as FastifyReply & { _sc: number };
    await routes.get("GET:/api/v1/admin/workers/:workerId")!(
      mkReq({ params: { workerId: "unknown" } }) as unknown as FastifyRequest,
      rp,
    );
    expect(rp._sc).toBe(404);
  });

  it("POST deregister forwards fleet entry target_worker_id (null → falls back to worker_id)", async () => {
    const rp = mkReply() as unknown as FastifyReply & { _b: unknown };
    await routes.get("POST:/api/v1/admin/workers/:workerId/deregister")!(
      mkReq({
        params: { workerId: "sandbox-uuid-1" },
        body: { reason: "maint" },
      }) as unknown as FastifyRequest,
      rp,
    );
    // mockFleet worker has target_worker_id: null → deregister uses worker_id
    expect(mockGh.deregisterWorker).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "maint", target_worker_id: "sandbox-uuid-1" }),
    );
  });

  it("POST deregister forwards fleet entry target_worker_id when it differs from worker_id", async () => {
    // GH fleet entry where worker_id ≠ target_worker_id (worker registered with sandbox UUID)
    mockGh.getWorkerFleet.mockResolvedValueOnce({
      workers: [
        {
          worker_id: "gh-internal-uuid",
          status: "active",
          target_worker_id: "sandbox-uuid-1",
          ec2_instance_id: "i-abc",
          ec2_ip: "1.2.3.4",
          current_job_id: null,
          registered_at: "2026-02-01T00:00:00Z",
          last_heartbeat: "2026-02-27T12:00:00Z",
          jobs_completed: 10,
          jobs_failed: 0,
          uptime_seconds: 86400,
        },
      ],
    });
    const rp = mkReply() as unknown as FastifyReply & { _b: unknown };
    // Admin clicks on "gh-internal-uuid" from the workers list
    await routes.get("POST:/api/v1/admin/workers/:workerId/deregister")!(
      mkReq({
        params: { workerId: "gh-internal-uuid" },
        body: { reason: "maint" },
      }) as unknown as FastifyRequest,
      rp,
    );
    // Should forward target_worker_id from fleet entry, not the URL param
    expect(mockGh.deregisterWorker).toHaveBeenCalledWith(
      expect.objectContaining({ target_worker_id: "sandbox-uuid-1" }),
    );
  });

  it("POST deregister resolves sandbox via target_worker_id when worker_id differs", async () => {
    // Worker registered with different worker_id, target_worker_id = sandbox UUID
    mockGh.getWorkerFleet.mockResolvedValueOnce({
      workers: [
        {
          worker_id: "gh-internal-uuid",
          status: "active",
          target_worker_id: "sandbox-uuid-1",
          ec2_instance_id: "i-abc",
          ec2_ip: "1.2.3.4",
          current_job_id: null,
          registered_at: "2026-02-01T00:00:00Z",
          last_heartbeat: "2026-02-27T12:00:00Z",
          jobs_completed: 0,
          jobs_failed: 0,
          uptime_seconds: 3600,
        },
      ],
    });
    // Sandbox has atm_fleet_id tag → ATM-managed
    mockSbRepo.findAllActive.mockResolvedValueOnce([
      {
        id: "sandbox-uuid-1",
        name: "atm-worker",
        environment: "staging",
        instanceId: "i-abc",
        tags: { atm_fleet_id: "gh-worker-1" },
      },
    ]);
    const rp = mkReply() as unknown as FastifyReply & { _b: unknown; _sc: number };
    // URL param "gh-internal-uuid" doesn't match sandbox.id, but target_worker_id does
    await routes.get("POST:/api/v1/admin/workers/:workerId/deregister")!(
      mkReq({
        params: { workerId: "gh-internal-uuid" },
        body: { reason: "test" },
      }) as unknown as FastifyRequest,
      rp,
    );
    expect(rp._sc).toBe(400);
    expect(rp._b).toEqual(expect.objectContaining({ error: expect.stringContaining("ATM") }));
    expect(mockGh.deregisterWorker).not.toHaveBeenCalled();
  });

  it("POST deregister default reason", async () => {
    const rp = mkReply() as unknown as FastifyReply & { _b: unknown };
    await routes.get("POST:/api/v1/admin/workers/:workerId/deregister")!(
      mkReq({ params: { workerId: "sandbox-uuid-1" }, body: {} }) as unknown as FastifyRequest,
      rp,
    );
    expect(mockGh.deregisterWorker).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "admin_deregister" }),
    );
  });

  it("POST deregister returns 404 for unknown worker", async () => {
    const rp = mkReply() as unknown as FastifyReply & { _b: unknown; _sc: number };
    await routes.get("POST:/api/v1/admin/workers/:workerId/deregister")!(
      mkReq({
        params: { workerId: "gh-worker-1" },
        body: { reason: "test" },
      }) as unknown as FastifyRequest,
      rp,
    );
    expect(rp._sc).toBe(404);
    expect(mockGh.deregisterWorker).not.toHaveBeenCalled();
  });

  it("POST deregister resolves ATM-managed sandbox via IP when ec2_instance_id is null", async () => {
    // Worker with null ec2_instance_id — only linkable by IP
    mockGh.getWorkerFleet.mockResolvedValueOnce({
      workers: [
        {
          worker_id: "ip-only-worker",
          status: "active",
          target_worker_id: null,
          ec2_instance_id: null,
          ec2_ip: "10.0.0.99",
          current_job_id: null,
          registered_at: "2026-02-01T00:00:00Z",
          last_heartbeat: "2026-02-27T12:00:00Z",
          jobs_completed: 0,
          jobs_failed: 0,
          uptime_seconds: 3600,
        },
      ],
    });
    mockSbRepo.findAllActive.mockResolvedValueOnce([
      {
        id: "sandbox-ip-match",
        name: "ip-matched",
        environment: "staging",
        instanceId: null,
        publicIp: "10.0.0.99",
        tags: { atm_fleet_id: "gh-worker-1" },
      },
    ]);
    const rp = mkReply() as unknown as FastifyReply & { _b: unknown; _sc: number };
    await routes.get("POST:/api/v1/admin/workers/:workerId/deregister")!(
      mkReq({
        params: { workerId: "ip-only-worker" },
        body: { reason: "test" },
      }) as unknown as FastifyRequest,
      rp,
    );
    // Should find sandbox via IP fallback and reject as ATM-managed
    expect(rp._sc).toBe(400);
    expect(rp._b).toEqual(expect.objectContaining({ error: expect.stringContaining("ATM") }));
    expect(mockGh.deregisterWorker).not.toHaveBeenCalled();
  });
});

// ─── ATM Code Path Tests ───────────────────────────────────────────

describe("Worker Admin Routes (ATM path)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockAtmFleetClient.isConfigured = true;
    mockSbRepo.findAllActive.mockResolvedValue(mockAtmSandboxes);
    await setup();
  });

  afterEach(() => {
    mockAtmFleetClient.isConfigured = false;
    mockSbRepo.findAllActive.mockResolvedValue(mockSandboxes);
  });

  it("GET list uses ATM fleet data when configured", async () => {
    const rp = mkReply() as unknown as FastifyReply & { _b: unknown };
    await routes.get("GET:/api/v1/admin/workers")!(mkReq() as unknown as FastifyRequest, rp);
    const b = rp._b as { workers: unknown[]; total: number; source: string };
    expect(b.source).toBe("atm");
    expect(b.total).toBe(2);
    expect(mockAtmFleetClient.getIdleStatus).toHaveBeenCalled();
    expect(mockGh.getWorkerFleet).not.toHaveBeenCalled();
  });

  it("GET list resolves sandbox by instanceId for ATM workers", async () => {
    const rp = mkReply() as unknown as FastifyReply & { _b: unknown };
    await routes.get("GET:/api/v1/admin/workers")!(mkReq() as unknown as FastifyRequest, rp);
    const b = rp._b as {
      workers: Array<{ worker_id: string; sandbox_id: string | null; sandbox_name: string | null }>;
    };
    expect(b.workers[0]!.sandbox_id).toBe("sandbox-atm-1");
    expect(b.workers[0]!.sandbox_name).toBe("atm-prod-worker");
    expect(b.workers[1]!.sandbox_id).toBe("sandbox-atm-2");
    expect(b.workers[1]!.sandbox_name).toBe("atm-stg-worker");
  });

  it("GET list normalizes ATM status to active/draining/offline", async () => {
    const rp = mkReply() as unknown as FastifyReply & { _b: unknown };
    await routes.get("GET:/api/v1/admin/workers")!(mkReq() as unknown as FastifyRequest, rp);
    const b = rp._b as {
      workers: Array<{ status: string; ec2_state: string }>;
    };
    expect(b.workers[0]!.status).toBe("active");
    expect(b.workers[0]!.ec2_state).toBe("running");
    expect(b.workers[1]!.status).toBe("offline");
    expect(b.workers[1]!.ec2_state).toBe("stopped");
  });

  it("GET list derives source=atm from sandbox tags, not transport", async () => {
    const rp = mkReply() as unknown as FastifyReply & { _b: unknown };
    await routes.get("GET:/api/v1/admin/workers")!(mkReq() as unknown as FastifyRequest, rp);
    const b = rp._b as { workers: Array<{ source: string }> };
    // Source is derived from tags.atm_fleet_id on matched sandbox, not transport
    expect(b.workers[0]!.source).toBe("atm");
    expect(b.workers[1]!.source).toBe("atm");
  });

  it("GET list passes through ec2_state, active_jobs, transitioning", async () => {
    const rp = mkReply() as unknown as FastifyReply & { _b: unknown };
    await routes.get("GET:/api/v1/admin/workers")!(mkReq() as unknown as FastifyRequest, rp);
    const b = rp._b as {
      workers: Array<{ ec2_state: string; active_jobs: number; transitioning: boolean }>;
    };
    expect(b.workers[0]!.ec2_state).toBe("running");
    expect(b.workers[0]!.active_jobs).toBe(1);
    expect(b.workers[0]!.transitioning).toBe(false);
  });

  it("GET list falls back to GH when ATM fails", async () => {
    mockAtmFleetClient.getIdleStatus.mockRejectedValueOnce(new Error("timeout"));
    mockSbRepo.findAllActive.mockResolvedValue(mockSandboxes);
    const rp = mkReply() as unknown as FastifyReply & { _b: unknown };
    await routes.get("GET:/api/v1/admin/workers")!(mkReq() as unknown as FastifyRequest, rp);
    const b = rp._b as { source: string };
    expect(b.source).toBe("gh");
    expect(mockGh.getWorkerFleet).toHaveBeenCalled();
  });

  it("GET list normalizes stopping → draining", async () => {
    mockAtmFleetClient.getIdleStatus.mockResolvedValueOnce({
      enabled: true,
      workers: [
        {
          serverId: "gh-worker-3",
          ip: "10.0.0.3",
          instanceId: null,
          ec2State: "stopping",
          activeJobs: 0,
          idleSinceMs: 0,
          transitioning: true,
        },
      ],
    });
    const rp = mkReply() as unknown as FastifyReply & { _b: unknown };
    await routes.get("GET:/api/v1/admin/workers")!(mkReq() as unknown as FastifyRequest, rp);
    const b = rp._b as { workers: Array<{ status: string; ec2_state: string }> };
    expect(b.workers[0]!.status).toBe("draining");
    expect(b.workers[0]!.ec2_state).toBe("stopping");
  });

  it("GET list handles null instanceId gracefully", async () => {
    mockAtmFleetClient.getIdleStatus.mockResolvedValueOnce({
      enabled: true,
      workers: [
        {
          serverId: "gh-worker-orphan",
          ip: "",
          instanceId: null,
          ec2State: "stopped",
          activeJobs: 0,
          idleSinceMs: 0,
          transitioning: false,
        },
      ],
    });
    const rp = mkReply() as unknown as FastifyReply & { _b: unknown };
    await routes.get("GET:/api/v1/admin/workers")!(mkReq() as unknown as FastifyRequest, rp);
    const b = rp._b as { workers: Array<{ sandbox_id: string | null; source: string }> };
    expect(b.workers[0]!.sandbox_id).toBeNull();
    // No sandbox matched → no atm_fleet_id tag → source defaults to gh
    expect(b.workers[0]!.source).toBe("gh");
  });
});

// ─── Ownership-based source during GH fallback ──────────────────────

describe("Worker Admin Routes (GH fallback with ATM-managed sandboxes)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // ATM is configured — getIdleStatus reachable for deregister/drain guards, but
    // GET list path fails (simulates partial ATM availability)
    mockAtmFleetClient.isConfigured = true;
    mockAtmFleetClient.getIdleStatus.mockRejectedValue(new Error("ATM down"));
    // GH fleet returns workers by sandbox UUID
    mockGh.getWorkerFleet.mockResolvedValue({
      workers: [
        {
          worker_id: "sandbox-atm-1",
          status: "active",
          target_worker_id: null,
          ec2_ip: "10.0.0.1",
          current_job_id: null,
          registered_at: "2026-02-01T00:00:00Z",
          last_heartbeat: "2026-02-27T12:00:00Z",
          jobs_completed: 5,
          jobs_failed: 0,
          uptime_seconds: 3600,
        },
      ],
    });
    // Sandboxes have atm_fleet_id tags
    mockSbRepo.findAllActive.mockResolvedValue(mockAtmSandboxes);
    await setup();
  });

  afterEach(() => {
    mockAtmFleetClient.isConfigured = false;
    mockAtmFleetClient.getIdleStatus.mockResolvedValue(mockAtmIdleStatus);
    mockGh.getWorkerFleet.mockResolvedValue(mockFleet);
    mockSbRepo.findAllActive.mockResolvedValue(mockSandboxes);
  });

  it("GET list marks workers as source=atm based on sandbox tags even via GH transport", async () => {
    const rp = mkReply() as unknown as FastifyReply & { _b: unknown };
    await routes.get("GET:/api/v1/admin/workers")!(mkReq() as unknown as FastifyRequest, rp);
    const b = rp._b as { workers: Array<{ worker_id: string; source: string }> };
    // Even though data came from GH fallback, sandbox has atm_fleet_id → source=atm
    expect(b.workers[0]!.source).toBe("atm");
  });

  it("POST deregister rejects ATM-managed worker (tag-based)", async () => {
    // ATM unreachable for deregister guard too — falls back to tag-only
    const rp = mkReply() as unknown as FastifyReply & { _b: unknown; _sc: number };
    await routes.get("POST:/api/v1/admin/workers/:workerId/deregister")!(
      mkReq({
        params: { workerId: "sandbox-atm-1" },
        body: { reason: "test" },
      }) as unknown as FastifyRequest,
      rp,
    );
    expect(rp._sc).toBe(400);
    expect(rp._b).toEqual(expect.objectContaining({ error: expect.stringContaining("ATM") }));
    expect(mockGh.deregisterWorker).not.toHaveBeenCalled();
  });

  it("POST deregister returns 502 when GH fleet is also unreachable", async () => {
    mockGh.getWorkerFleet.mockRejectedValueOnce(new Error("GH down"));
    const rp = mkReply() as unknown as FastifyReply & { _b: unknown; _sc: number };
    await routes.get("POST:/api/v1/admin/workers/:workerId/deregister")!(
      mkReq({
        params: { workerId: "sandbox-atm-1" },
        body: { reason: "test" },
      }) as unknown as FastifyRequest,
      rp,
    );
    expect(rp._sc).toBe(502);
  });
});

// ─── ATM down + untagged EC2 sandbox → fail closed ──────────────────

describe("Worker Admin Routes (ATM down + untagged EC2 sandbox)", () => {
  const untaggedEc2Sandboxes = [
    {
      id: "sandbox-ec2-untagged",
      name: "ec2-no-tag",
      environment: "staging",
      instanceId: "i-ec2-untagged",
      publicIp: "10.0.0.42",
      tags: null, // No atm_fleet_id — instance-discovery created, startMachine never called
    },
  ];

  beforeEach(async () => {
    vi.clearAllMocks();
    mockAtmFleetClient.isConfigured = true;
    mockAtmFleetClient.getIdleStatus.mockRejectedValue(new Error("ATM down"));
    mockSbRepo.findAllActive.mockResolvedValue(untaggedEc2Sandboxes);
    mockGh.getWorkerFleet.mockResolvedValue({
      workers: [
        {
          worker_id: "sandbox-ec2-untagged",
          status: "active",
          target_worker_id: null,
          ec2_instance_id: "i-ec2-untagged",
          ec2_ip: "10.0.0.42",
          current_job_id: null,
          registered_at: "2026-02-01T00:00:00Z",
          last_heartbeat: "2026-02-28T12:00:00Z",
          jobs_completed: 0,
          jobs_failed: 0,
          uptime_seconds: 3600,
        },
      ],
    });
    await setup();
  });

  afterEach(() => {
    mockAtmFleetClient.isConfigured = false;
    mockAtmFleetClient.getIdleStatus.mockResolvedValue(mockAtmIdleStatus);
    mockSbRepo.findAllActive.mockResolvedValue(mockSandboxes);
    mockGh.getWorkerFleet.mockResolvedValue(mockFleet);
  });

  it("GET list marks untagged EC2 sandbox as source=atm when ATM is down (fail closed)", async () => {
    const rp = mkReply() as unknown as FastifyReply & { _b: unknown };
    await routes.get("GET:/api/v1/admin/workers")!(mkReq() as unknown as FastifyRequest, rp);
    const b = rp._b as { workers: Array<{ source: string; sandbox_id: string }> };
    // ATM configured but unreachable + EC2 sandbox without tag → fail closed → source=atm
    expect(b.workers[0]!.source).toBe("atm");
    expect(b.workers[0]!.sandbox_id).toBe("sandbox-ec2-untagged");
  });

  it("POST deregister returns 503 for untagged EC2 sandbox when ATM is down", async () => {
    const rp = mkReply() as unknown as FastifyReply & { _b: unknown; _sc: number };
    await routes.get("POST:/api/v1/admin/workers/:workerId/deregister")!(
      mkReq({
        params: { workerId: "sandbox-ec2-untagged" },
        body: { reason: "test" },
      }) as unknown as FastifyRequest,
      rp,
    );
    // 503 (not 400) — ATM is down, ownership is uncertain, fail closed
    expect(rp._sc).toBe(503);
    expect(rp._b).toEqual(
      expect.objectContaining({ error: expect.stringContaining("ATM is unreachable") }),
    );
    expect(mockGh.deregisterWorker).not.toHaveBeenCalled();
  });

  it("POST drain returns 503 for untagged EC2 sandbox when ATM is down", async () => {
    mockAgentClient.drain.mockResolvedValue({
      success: true,
      drainedWorkers: [],
      message: "",
    });
    mockSandboxProvider.getAgentUrl.mockReturnValue("http://10.0.0.42:3101");
    mockProviderFactory.getProvider.mockReturnValue(mockSandboxProvider);
    const rp = mkReply() as unknown as FastifyReply & { _b: unknown; _sc: number };
    await routes.get("POST:/api/v1/admin/workers/:workerId/drain")!(
      {
        diScope: {
          cradle: {
            ghosthandsClient: mockGh,
            sandboxRepo: mockSbRepo,
            ghJobRepo: mockGhJobRepo,
            atmFleetClient: mockAtmFleetClient,
            sandboxProviderFactory: mockProviderFactory,
            sandboxAgentClient: mockAgentClient,
          },
        },
        log: mockLog,
        params: { workerId: "sandbox-ec2-untagged" },
      } as unknown as FastifyRequest,
      rp,
    );
    // 503 — fail closed, cannot verify ownership
    expect(rp._sc).toBe(503);
    expect(rp._b).toEqual(
      expect.objectContaining({ error: expect.stringContaining("ATM is unreachable") }),
    );
    expect(mockAgentClient.drain).not.toHaveBeenCalled();
  });

  it("POST deregister still returns 400 for tagged sandbox even when ATM is down", async () => {
    // Sandbox WITH atm_fleet_id — confirmed ATM-managed regardless of ATM reachability
    mockSbRepo.findAllActive.mockResolvedValueOnce([
      {
        id: "sandbox-ec2-untagged",
        name: "tagged-worker",
        environment: "staging",
        instanceId: "i-ec2-untagged",
        tags: { atm_fleet_id: "gh-worker-1" },
      },
    ]);
    const rp = mkReply() as unknown as FastifyReply & { _b: unknown; _sc: number };
    await routes.get("POST:/api/v1/admin/workers/:workerId/deregister")!(
      mkReq({
        params: { workerId: "sandbox-ec2-untagged" },
        body: { reason: "test" },
      }) as unknown as FastifyRequest,
      rp,
    );
    // 400 (not 503) — confirmed ATM ownership via tag
    expect(rp._sc).toBe(400);
    expect(rp._b).toEqual(
      expect.objectContaining({ error: expect.stringContaining("managed by ATM") }),
    );
  });
});

// ─── asg_managed tag does NOT imply ATM ownership ────────────────────

describe("Worker Admin Routes (asg_managed without ATM)", () => {
  const asgManagedSandboxes = [
    {
      id: "sandbox-asg-1",
      name: "gh-worker-asg-1",
      environment: "staging",
      instanceId: "i-asg-xyz",
      publicIp: "10.0.0.5",
      tags: { asg_managed: true, asg_name: "ghosthands-worker-asg", purpose: "staging" },
    },
  ];

  beforeEach(async () => {
    vi.clearAllMocks();
    // ATM not configured — asg_managed alone must NOT block admin actions
    mockAtmFleetClient.isConfigured = false;
    mockSbRepo.findAllActive.mockResolvedValue(asgManagedSandboxes);
    mockGh.getWorkerFleet.mockResolvedValue({
      workers: [
        {
          worker_id: "sandbox-asg-1",
          status: "active",
          target_worker_id: null,
          ec2_instance_id: "i-asg-xyz",
          ec2_ip: "10.0.0.5",
          current_job_id: null,
          registered_at: "2026-02-01T00:00:00Z",
          last_heartbeat: "2026-02-27T12:00:00Z",
          jobs_completed: 0,
          jobs_failed: 0,
          uptime_seconds: 3600,
        },
      ],
    });
    await setup();
  });

  afterEach(() => {
    mockSbRepo.findAllActive.mockResolvedValue(mockSandboxes);
    mockGh.getWorkerFleet.mockResolvedValue(mockFleet);
  });

  it("GET list marks asg_managed sandbox as source=gh when ATM is not configured", async () => {
    const rp = mkReply() as unknown as FastifyReply & { _b: unknown };
    await routes.get("GET:/api/v1/admin/workers")!(mkReq() as unknown as FastifyRequest, rp);
    const b = rp._b as { workers: Array<{ source: string; sandbox_id: string }> };
    // asg_managed is an ASG tag, not an ATM ownership signal
    expect(b.workers[0]!.source).toBe("gh");
    expect(b.workers[0]!.sandbox_id).toBe("sandbox-asg-1");
  });

  it("POST deregister allows asg_managed sandbox when ATM is not configured", async () => {
    const rp = mkReply() as unknown as FastifyReply & { _b: unknown; _sc: number };
    await routes.get("POST:/api/v1/admin/workers/:workerId/deregister")!(
      mkReq({
        params: { workerId: "sandbox-asg-1" },
        body: { reason: "test" },
      }) as unknown as FastifyRequest,
      rp,
    );
    // Should succeed — asg_managed alone doesn't make it ATM-managed
    expect(rp._sc).toBe(200);
    expect(mockGh.deregisterWorker).toHaveBeenCalled();
  });

  it("POST drain allows asg_managed sandbox when ATM is not configured", async () => {
    mockAgentClient.drain.mockResolvedValue({
      success: true,
      drainedWorkers: ["sandbox-asg-1"],
      message: "Worker drained",
    });
    mockSandboxProvider.getAgentUrl.mockReturnValue("http://10.0.0.5:3101");
    mockProviderFactory.getProvider.mockReturnValue(mockSandboxProvider);
    const rp = mkReply() as unknown as FastifyReply & { _b: unknown; _sc: number };
    await routes.get("POST:/api/v1/admin/workers/:workerId/drain")!(
      {
        diScope: {
          cradle: {
            ghosthandsClient: mockGh,
            sandboxRepo: mockSbRepo,
            ghJobRepo: mockGhJobRepo,
            atmFleetClient: mockAtmFleetClient,
            sandboxProviderFactory: mockProviderFactory,
            sandboxAgentClient: mockAgentClient,
          },
        },
        log: mockLog,
        params: { workerId: "sandbox-asg-1" },
      } as unknown as FastifyRequest,
      rp,
    );
    // Should succeed — asg_managed is not ATM ownership
    expect(rp._sc).toBe(200);
    expect(mockAgentClient.drain).toHaveBeenCalled();
  });
});

// ─── ec2_instance_id-based sandbox resolution in GH fallback ─────────

describe("Worker Admin Routes (GH fallback ec2_instance_id resolution)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockAtmFleetClient.isConfigured = false;
    // Worker whose only link to sandbox is ec2_instance_id (not worker_id or target_worker_id)
    mockGh.getWorkerFleet.mockResolvedValue({
      workers: [
        {
          worker_id: "gh-internal-uuid",
          status: "active",
          target_worker_id: null,
          ec2_instance_id: "i-ec2-match",
          ec2_ip: "10.0.0.99",
          current_job_id: null,
          registered_at: "2026-02-01T00:00:00Z",
          last_heartbeat: "2026-02-27T12:00:00Z",
          jobs_completed: 0,
          jobs_failed: 0,
          uptime_seconds: 3600,
        },
      ],
    });
    // Sandbox only discoverable via instanceId — id ≠ worker_id, no target_worker_id match
    mockSbRepo.findAllActive.mockResolvedValue([
      {
        id: "sandbox-ec2-only",
        name: "ec2-linked-sandbox",
        environment: "staging",
        instanceId: "i-ec2-match",
        tags: null,
      },
    ]);
    await setup();
  });

  afterEach(() => {
    mockGh.getWorkerFleet.mockResolvedValue(mockFleet);
    mockSbRepo.findAllActive.mockResolvedValue(mockSandboxes);
  });

  it("GET list resolves sandbox via ec2_instance_id when worker_id and target_worker_id don't match", async () => {
    const rp = mkReply() as unknown as FastifyReply & { _b: unknown };
    await routes.get("GET:/api/v1/admin/workers")!(mkReq() as unknown as FastifyRequest, rp);
    const b = rp._b as {
      workers: Array<{ worker_id: string; sandbox_id: string | null; sandbox_name: string | null }>;
    };
    // Should resolve via ec2_instance_id → instanceId match
    expect(b.workers[0]!.sandbox_id).toBe("sandbox-ec2-only");
    expect(b.workers[0]!.sandbox_name).toBe("ec2-linked-sandbox");
  });
});

// ─── Untagged ATM sandbox detection via instanceId cross-reference ───

describe("Worker Admin Routes (untagged ATM sandbox)", () => {
  const untaggedSandboxes = [
    {
      id: "sandbox-untagged-1",
      name: "untagged-worker",
      environment: "staging",
      instanceId: "i-atm-abc123",
      tags: null, // No atm_fleet_id tag — created via seed/discovery
    },
  ];

  beforeEach(async () => {
    vi.clearAllMocks();
    mockAtmFleetClient.isConfigured = true;
    mockSbRepo.findAllActive.mockResolvedValue(untaggedSandboxes);
    // ATM fleet reports this instanceId as managed
    mockAtmFleetClient.getIdleStatus.mockResolvedValue(mockAtmIdleStatus);
    await setup();
  });

  afterEach(() => {
    mockAtmFleetClient.isConfigured = false;
    mockAtmFleetClient.getIdleStatus.mockResolvedValue(mockAtmIdleStatus);
    mockSbRepo.findAllActive.mockResolvedValue(mockSandboxes);
  });

  it("GET list detects untagged sandbox as ATM-managed via instanceId cross-reference", async () => {
    const rp = mkReply() as unknown as FastifyReply & { _b: unknown };
    await routes.get("GET:/api/v1/admin/workers")!(mkReq() as unknown as FastifyRequest, rp);
    const b = rp._b as { workers: Array<{ sandbox_id: string | null; source: string }> };
    // Sandbox matched by instanceId, and ATM worker has that instanceId → source=atm
    expect(b.workers[0]!.sandbox_id).toBe("sandbox-untagged-1");
    expect(b.workers[0]!.source).toBe("atm");
  });

  it("POST deregister rejects untagged ATM-managed worker via instanceId", async () => {
    // GH fleet also reports this worker
    mockGh.getWorkerFleet.mockResolvedValue({
      workers: [
        {
          worker_id: "sandbox-untagged-1",
          status: "active",
          target_worker_id: null,
          ec2_ip: "10.0.0.1",
          current_job_id: null,
          registered_at: "2026-02-01T00:00:00Z",
          last_heartbeat: "2026-02-27T12:00:00Z",
          jobs_completed: 0,
          jobs_failed: 0,
          uptime_seconds: 3600,
        },
      ],
    });
    const rp = mkReply() as unknown as FastifyReply & { _b: unknown; _sc: number };
    await routes.get("POST:/api/v1/admin/workers/:workerId/deregister")!(
      mkReq({
        params: { workerId: "sandbox-untagged-1" },
        body: { reason: "test" },
      }) as unknown as FastifyRequest,
      rp,
    );
    expect(rp._sc).toBe(400);
    expect(rp._b).toEqual(expect.objectContaining({ error: expect.stringContaining("ATM") }));
    expect(mockGh.deregisterWorker).not.toHaveBeenCalled();
  });
});

// ─── Drain route tests ──────────────────────────────────────────────

const mockSandboxProvider = {
  getAgentUrl: vi.fn().mockReturnValue("http://10.0.0.1:3101"),
};
const mockProviderFactory = {
  getProvider: vi.fn().mockReturnValue(mockSandboxProvider),
};
const mockAgentClient = {
  drain: vi.fn().mockResolvedValue({
    success: true,
    drainedWorkers: ["sandbox-uuid-1"],
    message: "Worker drained",
  }),
};

describe("Worker Admin Routes (drain)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockAtmFleetClient.isConfigured = false;
    // Re-set mocks after clearAllMocks
    mockGh.getWorkerFleet.mockResolvedValue(mockFleet);
    mockSbRepo.findAllActive.mockResolvedValue([
      ...mockSandboxes.map((s) => ({
        ...s,
        instanceId: s.id === "sandbox-uuid-1" ? "i-abc" : "i-def",
        publicIp: s.id === "sandbox-uuid-1" ? "1.2.3.4" : "5.6.7.8",
      })),
    ]);
    mockAgentClient.drain.mockResolvedValue({
      success: true,
      drainedWorkers: ["sandbox-uuid-1"],
      message: "Worker drained",
    });
    mockSandboxProvider.getAgentUrl.mockReturnValue("http://10.0.0.1:3101");
    mockProviderFactory.getProvider.mockReturnValue(mockSandboxProvider);
    await setup();
  });

  afterEach(() => {
    mockSbRepo.findAllActive.mockResolvedValue(mockSandboxes);
  });

  function mkDrainReq(workerId: string) {
    return {
      diScope: {
        cradle: {
          ghosthandsClient: mockGh,
          sandboxRepo: mockSbRepo,
          ghJobRepo: mockGhJobRepo,
          atmFleetClient: mockAtmFleetClient,
          sandboxProviderFactory: mockProviderFactory,
          sandboxAgentClient: mockAgentClient,
        },
      },
      log: mockLog,
      params: { workerId },
    };
  }

  it("POST drain succeeds for GH-managed worker", async () => {
    const rp = mkReply() as unknown as FastifyReply & { _b: unknown; _sc: number };
    await routes.get("POST:/api/v1/admin/workers/:workerId/drain")!(
      mkDrainReq("sandbox-uuid-1") as unknown as FastifyRequest,
      rp,
    );
    expect(rp._sc).toBe(200);
    const b = rp._b as { success: boolean; sandboxId: string };
    expect(b.success).toBe(true);
    expect(b.sandboxId).toBe("sandbox-uuid-1");
    expect(mockAgentClient.drain).toHaveBeenCalledWith("http://10.0.0.1:3101", "sandbox-uuid-1");
  });

  it("POST drain returns 404 for unknown worker", async () => {
    const rp = mkReply() as unknown as FastifyReply & { _b: unknown; _sc: number };
    await routes.get("POST:/api/v1/admin/workers/:workerId/drain")!(
      mkDrainReq("unknown-worker") as unknown as FastifyRequest,
      rp,
    );
    expect(rp._sc).toBe(404);
    expect(mockAgentClient.drain).not.toHaveBeenCalled();
  });

  it("POST drain rejects ATM-managed worker (tag-based)", async () => {
    // Swap sandboxes to ATM-tagged ones
    mockSbRepo.findAllActive.mockResolvedValue(
      mockAtmSandboxes.map((s) => ({
        ...s,
        publicIp: s.id === "sandbox-atm-1" ? "10.0.0.1" : null,
      })),
    );
    // GH fleet reports worker with matching sandbox ID
    mockGh.getWorkerFleet.mockResolvedValue({
      workers: [
        {
          worker_id: "sandbox-atm-1",
          status: "active",
          target_worker_id: null,
          ec2_ip: "10.0.0.1",
          current_job_id: null,
          registered_at: "2026-02-01T00:00:00Z",
          last_heartbeat: "2026-02-27T12:00:00Z",
          jobs_completed: 0,
          jobs_failed: 0,
          uptime_seconds: 3600,
        },
      ],
    });
    const rp = mkReply() as unknown as FastifyReply & { _b: unknown; _sc: number };
    await routes.get("POST:/api/v1/admin/workers/:workerId/drain")!(
      mkDrainReq("sandbox-atm-1") as unknown as FastifyRequest,
      rp,
    );
    expect(rp._sc).toBe(400);
    expect(rp._b).toEqual(expect.objectContaining({ error: expect.stringContaining("ATM") }));
    expect(mockAgentClient.drain).not.toHaveBeenCalled();
  });

  it("POST drain prioritizes ID match over stale IP match", async () => {
    // Sandbox A has stale IP that matches worker B's ec2_ip
    mockSbRepo.findAllActive.mockResolvedValue([
      {
        id: "sandbox-stale-ip",
        name: "stale-ip",
        environment: "staging",
        instanceId: "i-stale",
        publicIp: "1.2.3.4", // Stale IP from worker sandbox-uuid-1
        tags: { atm_fleet_id: "gh-stale" }, // ATM-managed
      },
      {
        id: "sandbox-uuid-1",
        name: "correct-sandbox",
        environment: "production",
        instanceId: "i-correct",
        publicIp: "9.9.9.9",
        tags: null, // GH-managed
      },
    ]);
    const rp = mkReply() as unknown as FastifyReply & { _b: unknown; _sc: number };
    await routes.get("POST:/api/v1/admin/workers/:workerId/drain")!(
      mkDrainReq("sandbox-uuid-1") as unknown as FastifyRequest,
      rp,
    );
    // Should match by ID (sandbox-uuid-1, GH-managed) not by IP (sandbox-stale-ip, ATM-managed)
    expect(rp._sc).toBe(200);
    const b = rp._b as { sandboxId: string };
    expect(b.sandboxId).toBe("sandbox-uuid-1");
  });

  it("POST drain finds worker via target_worker_id and sends canonical worker_id to agent", async () => {
    // GH fleet entry where worker_id ≠ target_worker_id
    mockGh.getWorkerFleet.mockResolvedValue({
      workers: [
        {
          worker_id: "gh-drain-uuid",
          status: "active",
          target_worker_id: "sandbox-uuid-1",
          ec2_instance_id: "i-abc",
          ec2_ip: "1.2.3.4",
          current_job_id: null,
          registered_at: "2026-02-01T00:00:00Z",
          last_heartbeat: "2026-02-27T12:00:00Z",
          jobs_completed: 0,
          jobs_failed: 0,
          uptime_seconds: 3600,
        },
      ],
    });
    const rp = mkReply() as unknown as FastifyReply & { _b: unknown; _sc: number };
    // Admin passes target_worker_id as URL param
    await routes.get("POST:/api/v1/admin/workers/:workerId/drain")!(
      mkDrainReq("sandbox-uuid-1") as unknown as FastifyRequest,
      rp,
    );
    expect(rp._sc).toBe(200);
    // Should pass canonical worker_id to agent, not URL param
    expect(mockAgentClient.drain).toHaveBeenCalledWith("http://10.0.0.1:3101", "gh-drain-uuid");
    const b = rp._b as { workerId: string; sandboxId: string };
    expect(b.workerId).toBe("gh-drain-uuid");
    expect(b.sandboxId).toBe("sandbox-uuid-1");
  });

  it("POST drain rejects untagged ATM-managed worker via instanceId cross-reference", async () => {
    mockAtmFleetClient.isConfigured = true;
    mockAtmFleetClient.getIdleStatus.mockResolvedValue(mockAtmIdleStatus);
    // Untagged sandbox whose instanceId matches ATM worker
    mockSbRepo.findAllActive.mockResolvedValue([
      {
        id: "sandbox-uuid-1",
        name: "untagged-but-atm",
        environment: "production",
        instanceId: "i-atm-abc123", // Matches ATM worker instanceId
        publicIp: "1.2.3.4",
        tags: null, // No tag
      },
    ]);
    const rp = mkReply() as unknown as FastifyReply & { _b: unknown; _sc: number };
    await routes.get("POST:/api/v1/admin/workers/:workerId/drain")!(
      mkDrainReq("sandbox-uuid-1") as unknown as FastifyRequest,
      rp,
    );
    expect(rp._sc).toBe(400);
    expect(rp._b).toEqual(expect.objectContaining({ error: expect.stringContaining("ATM") }));
    expect(mockAgentClient.drain).not.toHaveBeenCalled();
    mockAtmFleetClient.isConfigured = false;
  });
});
