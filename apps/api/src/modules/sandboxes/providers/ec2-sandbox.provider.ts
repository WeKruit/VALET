import type {
  SandboxProvider,
  MachineLifecycleResult,
  MachineStatus,
} from "./sandbox-provider.interface.js";
import type { EC2Service } from "../ec2.service.js";
import type { SandboxRecord } from "../sandbox.repository.js";

export class Ec2SandboxProvider implements SandboxProvider {
  readonly type = "ec2" as const;

  private ec2Service: EC2Service;

  constructor({ ec2Service }: { ec2Service: EC2Service }) {
    this.ec2Service = ec2Service;
  }

  async startMachine(sandbox: SandboxRecord): Promise<MachineLifecycleResult> {
    await this.ec2Service.startInstance(sandbox.instanceId);
    return { success: true, message: "EC2 instance starting", newStatus: "pending" };
  }

  async stopMachine(sandbox: SandboxRecord): Promise<MachineLifecycleResult> {
    await this.ec2Service.stopInstance(sandbox.instanceId);
    return { success: true, message: "EC2 instance stopping", newStatus: "stopping" };
  }

  async getMachineStatus(sandbox: SandboxRecord): Promise<MachineStatus> {
    const ec2Status = await this.ec2Service.getInstanceStatus(sandbox.instanceId);
    const stateMap: Record<string, MachineStatus["state"]> = {
      pending: "starting",
      running: "running",
      "shutting-down": "stopping",
      stopping: "stopping",
      stopped: "stopped",
      terminated: "terminated",
    };
    return {
      state: stateMap[ec2Status] ?? "unknown",
      publicIp: sandbox.publicIp,
      privateIp: sandbox.privateIp,
    };
  }

  getAgentUrl(sandbox: SandboxRecord): string {
    if (!sandbox.publicIp) throw new Error(`Sandbox ${sandbox.id} has no public IP`);
    return `http://${sandbox.publicIp}:8000`;
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
