/**
 * Separate test file for getAgentUrl ATM path.
 *
 * ec2-sandbox.provider.ts reads ATM_BASE_URL at module-eval time (line 16):
 *   const ATM_BASE_URL = (process.env.ATM_BASE_URL || "").replace(/\/$/, "");
 *
 * We must set the env var BEFORE importing the module so the const captures it.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Set env BEFORE dynamic import (vi.hoisted runs before imports)
const _envSetup = vi.hoisted(() => {
  process.env.ATM_BASE_URL = "https://atm-gw1.wekruit.com";
  process.env.ATM_DEPLOY_SECRET = "test-secret";
});

import { Ec2SandboxProvider } from "../../../providers/ec2-sandbox.provider.js";
import type { EC2Service } from "../../../ec2.service.js";
import type { AtmFleetClient } from "../../../atm-fleet.client.js";
import type { SandboxRecord } from "../../../sandbox.repository.js";

const SANDBOX_FIXTURE: SandboxRecord = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "test-sandbox",
  environment: "staging",
  instanceId: "i-0123456789abcdef0",
  instanceType: "t3.medium",
  publicIp: "34.197.248.80",
  privateIp: "10.0.1.100",
  status: "active",
  healthStatus: "healthy",
  lastHealthCheckAt: new Date(),
  capacity: 5,
  currentLoad: 0,
  sshKeyName: null,
  novncUrl: null,
  adspowerVersion: null,
  browserEngine: "adspower",
  browserConfig: null,
  tags: null,
  ec2Status: "running",
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
  healthCheckFailureCount: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makeMockEc2Service() {
  return {
    startInstance: vi.fn().mockResolvedValue(undefined),
    stopInstance: vi.fn().mockResolvedValue(undefined),
    getInstanceStatus: vi.fn().mockResolvedValue("running"),
    waitForStatus: vi.fn().mockResolvedValue("running"),
  };
}

function makeMockAtmFleetClient(configured = true) {
  return {
    isConfigured: configured,
    resolveFleetId: vi.fn().mockResolvedValue("gh-worker-1"),
    resolveFleetIdSync: vi.fn().mockReturnValue(null),
    getIdleStatus: vi.fn().mockResolvedValue({ enabled: false, workers: [] }),
    wakeWorker: vi.fn().mockResolvedValue({ status: "started", ip: null }),
    stopWorker: vi.fn().mockResolvedValue({ status: "stopping" }),
    getWorkerHealth: vi.fn().mockResolvedValue({ status: "healthy" }),
    getWorkerState: vi.fn().mockResolvedValue(null),
  } as unknown as AtmFleetClient;
}

describe("Ec2SandboxProvider.getAgentUrl (ATM configured)", () => {
  let atmFleetClient: ReturnType<typeof makeMockAtmFleetClient>;
  let provider: Ec2SandboxProvider;

  beforeEach(() => {
    atmFleetClient = makeMockAtmFleetClient(true);
    provider = new Ec2SandboxProvider({
      ec2Service: makeMockEc2Service() as unknown as EC2Service,
      atmFleetClient: atmFleetClient as unknown as AtmFleetClient,
    });
  });

  it("routes through ATM fleet proxy when fleet ID is in tags", () => {
    (atmFleetClient as any).resolveFleetIdSync.mockReturnValue("gh-worker-1");
    const sandbox = { ...SANDBOX_FIXTURE, tags: { atm_fleet_id: "gh-worker-1" } };

    const url = provider.getAgentUrl(sandbox);
    expect(url).toBe("https://atm-gw1.wekruit.com/fleet/gh-worker-1");
  });

  it("falls back to top-level ATM URL when no fleet ID", () => {
    (atmFleetClient as any).resolveFleetIdSync.mockReturnValue(null);

    const url = provider.getAgentUrl(SANDBOX_FIXTURE);
    expect(url).toBe("https://atm-gw1.wekruit.com");
  });

  it("returns top-level ATM URL when no public IP and no fleet ID (no throw)", () => {
    (atmFleetClient as any).resolveFleetIdSync.mockReturnValue(null);
    const noIpSandbox = { ...SANDBOX_FIXTURE, publicIp: null };

    const url = provider.getAgentUrl(noIpSandbox);
    expect(url).toBe("https://atm-gw1.wekruit.com");
  });

  it("strips trailing slash from ATM_BASE_URL", () => {
    // The module-level const already strips trailing slashes.
    // Verify the URL doesn't have double slashes.
    (atmFleetClient as any).resolveFleetIdSync.mockReturnValue("gh-worker-1");

    const url = provider.getAgentUrl(SANDBOX_FIXTURE);
    expect(url).not.toContain("//fleet");
    expect(url).toBe("https://atm-gw1.wekruit.com/fleet/gh-worker-1");
  });
});
