import type {
  SandboxProvider,
  MachineLifecycleResult,
  MachineStatus,
} from "./sandbox-provider.interface.js";
import type { EC2Service } from "../ec2.service.js";
import type { AtmFleetClient } from "../atm-fleet.client.js";
import type { SandboxRecord } from "../sandbox.repository.js";
import { SANDBOX_AGENT_PORT } from "../agent/sandbox-agent.client.js";

/**
 * ATM base URL — when ATM runs on a separate EC2 from GH, the agent URL
 * must point to ATM's IP/host, not the sandbox (GH) public IP.
 * Falls back to constructing from sandbox.publicIp for backwards compat.
 */
const ATM_BASE_URL = (process.env.ATM_BASE_URL || "").replace(/\/$/, "");

export class Ec2SandboxProvider implements SandboxProvider {
  readonly type = "ec2" as const;

  private ec2Service: EC2Service;
  private atmFleetClient: AtmFleetClient;

  constructor({
    ec2Service,
    atmFleetClient,
  }: {
    ec2Service: EC2Service;
    atmFleetClient: AtmFleetClient;
  }) {
    this.ec2Service = ec2Service;
    this.atmFleetClient = atmFleetClient;
  }

  async startMachine(sandbox: SandboxRecord): Promise<MachineLifecycleResult> {
    // Gap 1: Delegate to ATM as single authority for EC2 lifecycle
    if (this.atmFleetClient.isConfigured) {
      const fleetId = await this.atmFleetClient.resolveFleetId(sandbox);
      if (fleetId) {
        const result = await this.atmFleetClient.wakeWorker(fleetId);
        const isAlreadyRunning = result.status === "already_running";
        return {
          success: true,
          message: isAlreadyRunning
            ? "EC2 instance already running"
            : `EC2 instance starting via ATM (${result.status})`,
          newStatus: isAlreadyRunning ? "running" : "pending",
          metadata: {
            atm_fleet_id: fleetId,
            ...(result.ip ? { hostname: result.ip } : {}),
          },
        };
      }
    }

    // Fallback: direct EC2 SDK
    await this.ec2Service.startInstance(sandbox.instanceId);
    return { success: true, message: "EC2 instance starting", newStatus: "pending" };
  }

  async stopMachine(sandbox: SandboxRecord): Promise<MachineLifecycleResult> {
    // Gap 1: Delegate to ATM as single authority for EC2 lifecycle
    if (this.atmFleetClient.isConfigured) {
      const fleetId = await this.atmFleetClient.resolveFleetId(sandbox);
      if (fleetId) {
        // ATM will check for active jobs and refuse to stop if busy
        const result = await this.atmFleetClient.stopWorker(fleetId);
        return {
          success: true,
          message: `EC2 instance stopping via ATM (${result.status})`,
          newStatus: "stopping",
        };
      }
    }

    // Fallback: direct EC2 SDK
    await this.ec2Service.stopInstance(sandbox.instanceId);
    return { success: true, message: "EC2 instance stopping", newStatus: "stopping" };
  }

  async getMachineStatus(sandbox: SandboxRecord): Promise<MachineStatus> {
    // Gap 2: Use ATM as single source of truth for EC2 state
    if (this.atmFleetClient.isConfigured) {
      const fleetId = await this.atmFleetClient.resolveFleetId(sandbox);
      if (fleetId) {
        try {
          const workerState = await this.atmFleetClient.getWorkerState(fleetId);
          if (workerState) {
            const stateMap: Record<string, MachineStatus["state"]> = {
              running: "running",
              stopped: "stopped",
              stopping: "stopping",
              pending: "starting",
              "shutting-down": "stopping",
              terminated: "terminated",
              standby: "stopped",
            };
            return {
              state: stateMap[workerState.ec2State] ?? "unknown",
              publicIp: workerState.ip || sandbox.publicIp,
              privateIp: sandbox.privateIp,
            };
          }
        } catch {
          // Fall through to EC2 SDK
        }
      }
    }

    // Fallback: direct EC2 SDK
    const ec2Status = await this.ec2Service.getInstanceStatus(sandbox.instanceId);
    const stateMap: Record<string, MachineStatus["state"]> = {
      pending: "starting",
      running: "running",
      "shutting-down": "stopping",
      stopping: "stopping",
      stopped: "stopped",
      terminated: "terminated",
      standby: "stopped",
    };
    return {
      state: stateMap[ec2Status] ?? "unknown",
      publicIp: sandbox.publicIp,
      privateIp: sandbox.privateIp,
    };
  }

  getAgentUrl(sandbox: SandboxRecord): string {
    if (ATM_BASE_URL) {
      // Gap 4: Route through ATM fleet proxy for per-worker operations
      const fleetId = this.atmFleetClient.resolveFleetIdSync(sandbox);
      if (fleetId) return `${ATM_BASE_URL}/fleet/${fleetId}`;

      // Fallback to top-level ATM URL
      return ATM_BASE_URL;
    }
    if (!sandbox.publicIp) throw new Error(`Sandbox ${sandbox.id} has no public IP`);
    return `http://${sandbox.publicIp}:${SANDBOX_AGENT_PORT}`;
  }

  async pingAgent(sandbox: SandboxRecord): Promise<boolean> {
    try {
      const resp = await fetch(`${this.getAgentUrl(sandbox)}/health`, {
        signal: AbortSignal.timeout(5_000),
      });
      return resp.ok;
    } catch {
      return false;
    }
  }
}
