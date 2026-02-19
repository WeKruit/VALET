import type {
  SandboxProvider,
  MachineLifecycleResult,
  MachineStatus,
} from "./sandbox-provider.interface.js";
import type { SandboxRecord } from "../sandbox.repository.js";

export class MacOsSandboxProvider implements SandboxProvider {
  readonly type = "macos" as const;

  async startMachine(_sandbox: SandboxRecord): Promise<MachineLifecycleResult> {
    // macOS machines are always-on or use Wake-on-LAN
    return { success: true, message: "macOS machine is always on" };
  }

  async stopMachine(sandbox: SandboxRecord): Promise<MachineLifecycleResult> {
    try {
      const resp = await fetch(`${this.getAgentUrl(sandbox)}/system/shutdown`, {
        method: "POST",
        headers: { "X-Deploy-Secret": process.env.GH_DEPLOY_SECRET ?? "" },
        signal: AbortSignal.timeout(10_000),
      });
      return { success: resp.ok, message: resp.ok ? "Shutdown initiated" : "Shutdown failed" };
    } catch {
      return { success: false, message: "Failed to reach macOS agent for shutdown" };
    }
  }

  async getMachineStatus(sandbox: SandboxRecord): Promise<MachineStatus> {
    const reachable = await this.pingAgent(sandbox);
    return {
      state: reachable ? "running" : "stopped",
      publicIp: sandbox.publicIp,
      privateIp: sandbox.privateIp,
    };
  }

  getAgentUrl(sandbox: SandboxRecord): string {
    const host = sandbox.publicIp ?? sandbox.privateIp;
    if (!host) throw new Error(`Sandbox ${sandbox.id} has no IP configured`);
    return `http://${host}:8000`;
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
