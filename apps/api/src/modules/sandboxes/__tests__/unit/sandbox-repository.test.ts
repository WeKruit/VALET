import { describe, it, expect, vi } from "vitest";
import type { Mock } from "vitest";

// Mock @valet/db so sandboxes table columns are defined
vi.mock("@valet/db", () => ({
  sandboxes: {
    id: "id",
    name: "name",
    environment: "environment",
    instanceId: "instance_id",
    instanceType: "instance_type",
    publicIp: "public_ip",
    privateIp: "private_ip",
    status: "status",
    healthStatus: "health_status",
    lastHealthCheckAt: "last_health_check_at",
    capacity: "capacity",
    currentLoad: "current_load",
    sshKeyName: "ssh_key_name",
    novncUrl: "novnc_url",
    adspowerVersion: "adspower_version",
    browserEngine: "browser_engine",
    browserConfig: "browser_config",
    tags: "tags",
    ec2Status: "ec2_status",
    lastStartedAt: "last_started_at",
    lastStoppedAt: "last_stopped_at",
    autoStopEnabled: "auto_stop_enabled",
    idleMinutesBeforeStop: "idle_minutes_before_stop",
    machineType: "machine_type",
    agentVersion: "agent_version",
    agentLastSeenAt: "agent_last_seen_at",
    ghImageTag: "gh_image_tag",
    ghImageUpdatedAt: "gh_image_updated_at",
    deployedCommitSha: "deployed_commit_sha",
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
}));

// Mock drizzle-orm operators
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => ({ type: "eq", args })),
  and: vi.fn((...args: unknown[]) => ({ type: "and", args })),
  count: vi.fn(() => "count_fn"),
  desc: vi.fn((col: unknown) => ({ type: "desc", col })),
  asc: vi.fn((col: unknown) => ({ type: "asc", col })),
  ilike: vi.fn((...args: unknown[]) => ({ type: "ilike", args })),
  or: vi.fn((...args: unknown[]) => ({ type: "or", args })),
}));

import { SandboxRepository } from "../../sandbox.repository.js";

interface MockInsertChain {
  values: Mock;
  returning: Mock;
}

function makeInsertChain(returningData: unknown[] = []): MockInsertChain {
  const chain = {} as MockInsertChain;
  chain.returning = vi.fn().mockResolvedValue(returningData);
  chain.values = vi.fn().mockReturnValue(chain);
  return chain;
}

/** A full SandboxRecord row returned by `returning()` */
function fakeSandboxRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "sandbox-uuid-1",
    name: "test-sandbox",
    environment: "dev",
    instanceId: "i-abc123",
    instanceType: "t3.medium",
    publicIp: null,
    privateIp: null,
    status: "provisioning",
    healthStatus: "unhealthy",
    lastHealthCheckAt: null,
    capacity: 5,
    currentLoad: 0,
    sshKeyName: null,
    novncUrl: null,
    adspowerVersion: null,
    browserEngine: "adspower",
    browserConfig: {},
    tags: {},
    ec2Status: "stopped",
    lastStartedAt: null,
    lastStoppedAt: null,
    autoStopEnabled: false,
    idleMinutesBeforeStop: 30,
    machineType: "ec2",
    agentVersion: null,
    agentLastSeenAt: null,
    ghImageTag: null,
    ghImageUpdatedAt: null,
    deployedCommitSha: null,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    ...overrides,
  };
}

function makeMockDb(returningData: unknown[] = []) {
  const insertChain = makeInsertChain(returningData);

  return {
    insert: vi.fn().mockReturnValue(insertChain),
    _insertChain: insertChain,
  };
}

describe("SandboxRepository", () => {
  describe("create()", () => {
    it("should persist machineType when explicitly provided", async () => {
      const row = fakeSandboxRow({ machineType: "kasm" });
      const db = makeMockDb([row]);
      const repo = new SandboxRepository({ db: db as never });

      const result = await repo.create({
        name: "test-sandbox",
        environment: "dev",
        instanceId: "i-abc123",
        instanceType: "t3.medium",
        machineType: "kasm",
      });

      expect(db.insert).toHaveBeenCalledOnce();
      expect(db._insertChain.values).toHaveBeenCalledOnce();

      const insertedValues = db._insertChain.values.mock.calls[0]![0] as Record<string, unknown>;
      expect(insertedValues.machineType).toBe("kasm");

      // Verify the returned record also has the correct machineType
      expect(result.machineType).toBe("kasm");
    });

    it("should default machineType to 'ec2' when not provided", async () => {
      const row = fakeSandboxRow({ machineType: "ec2" });
      const db = makeMockDb([row]);
      const repo = new SandboxRepository({ db: db as never });

      const result = await repo.create({
        name: "test-sandbox",
        environment: "dev",
        instanceId: "i-abc123",
        instanceType: "t3.medium",
      });

      expect(db._insertChain.values).toHaveBeenCalledOnce();

      const insertedValues = db._insertChain.values.mock.calls[0]![0] as Record<string, unknown>;
      expect(insertedValues.machineType).toBe("ec2");

      expect(result.machineType).toBe("ec2");
    });

    it("should pass all required fields to values()", async () => {
      const row = fakeSandboxRow();
      const db = makeMockDb([row]);
      const repo = new SandboxRepository({ db: db as never });

      await repo.create({
        name: "my-sandbox",
        environment: "prod",
        instanceId: "i-xyz789",
        instanceType: "m5.large",
        publicIp: "1.2.3.4",
        capacity: 10,
        browserEngine: "chromium",
        machineType: "kasm",
      });

      const insertedValues = db._insertChain.values.mock.calls[0]![0] as Record<string, unknown>;
      expect(insertedValues).toMatchObject({
        name: "my-sandbox",
        environment: "prod",
        instanceId: "i-xyz789",
        instanceType: "m5.large",
        publicIp: "1.2.3.4",
        capacity: 10,
        browserEngine: "chromium",
        machineType: "kasm",
      });
    });
  });
});
