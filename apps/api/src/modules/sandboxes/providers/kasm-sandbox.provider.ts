import type {
  SandboxProvider,
  MachineLifecycleResult,
  MachineStatus,
} from "./sandbox-provider.interface.js";
import type { KasmClient } from "../kasm/kasm.client.js";
import type { SandboxRecord } from "../sandbox.repository.js";

const DEFAULT_IMAGE_ID = process.env.KASM_DEFAULT_IMAGE_ID ?? "";
const DEFAULT_USER_ID = process.env.KASM_DEFAULT_USER_ID ?? "";

export class KasmSandboxProvider implements SandboxProvider {
  readonly type = "kasm" as const;

  private kasmClient: KasmClient;

  constructor({ kasmClient }: { kasmClient: KasmClient }) {
    this.kasmClient = kasmClient;
  }

  async startMachine(sandbox: SandboxRecord): Promise<MachineLifecycleResult> {
    const imageId =
      ((sandbox.tags as Record<string, unknown> | null)?.kasm_image_id as string | undefined) ??
      DEFAULT_IMAGE_ID;
    const userId =
      ((sandbox.tags as Record<string, unknown> | null)?.kasm_user_id as string | undefined) ??
      DEFAULT_USER_ID;

    const response = await this.kasmClient.requestKasm({
      image_id: imageId,
      user_id: userId,
    });

    return {
      success: true,
      message: "Kasm session created",
      newStatus: "pending",
      metadata: {
        kasm_id: response.kasm_id,
        kasm_url: response.kasm_url,
        hostname: response.hostname,
        session_token: response.session_token,
        kasm_port_map: response.port_map,
        kasm_image_id: imageId,
        kasm_user_id: userId,
      },
    };
  }

  async stopMachine(sandbox: SandboxRecord): Promise<MachineLifecycleResult> {
    if (!sandbox.instanceId) {
      return { success: false, message: "No Kasm session ID (instanceId) to destroy" };
    }

    await this.kasmClient.destroyKasm(sandbox.instanceId);
    return { success: true, message: "Kasm session destroyed", newStatus: "stopping" };
  }

  async getMachineStatus(sandbox: SandboxRecord): Promise<MachineStatus> {
    if (!sandbox.instanceId) {
      return { state: "unknown" };
    }

    try {
      const response = await this.kasmClient.getKasmStatus(sandbox.instanceId);
      const state = this.mapOperationalStatus(response.kasm.operational_status);

      return {
        state,
        publicIp: response.kasm.hostname || sandbox.publicIp,
        privateIp: sandbox.privateIp,
        machineMetadata: {
          kasm_url: response.kasm.kasm_url,
          port_map: response.kasm.port_map,
        },
      };
    } catch {
      // Session may have been destroyed
      return { state: "stopped", publicIp: sandbox.publicIp };
    }
  }

  getAgentUrl(sandbox: SandboxRecord): string {
    // Try to resolve from Kasm port map (container port 3100 mapped to a host port)
    const portMap = (sandbox.tags as Record<string, unknown> | null)?.kasm_port_map as
      | Record<string, { port: number; path: string }>
      | undefined;
    if (portMap?.["3100"]) {
      const hostname =
        sandbox.publicIp ??
        ((sandbox.tags as Record<string, unknown> | null)?.kasm_hostname as string | undefined);
      if (hostname) {
        return `http://${hostname}:${portMap["3100"].port}`;
      }
    }

    // Fallback to publicIp:3100 (standard GH worker port)
    if (sandbox.publicIp) {
      return `http://${sandbox.publicIp}:3100`;
    }

    throw new Error(`Sandbox ${sandbox.id} has no reachable agent URL`);
  }

  async pingAgent(sandbox: SandboxRecord): Promise<boolean> {
    try {
      const resp = await fetch(`${this.getAgentUrl(sandbox)}/health`, {
        signal: AbortSignal.timeout(5_000),
      });
      return resp.ok;
    } catch {
      // A running Kasm session with a dead agent is unreachable, not healthy
      return false;
    }
  }

  // ─── Kasm-specific methods (not on interface) ───

  async keepalive(sandbox: SandboxRecord): Promise<void> {
    if (sandbox.instanceId) {
      await this.kasmClient.keepalive(sandbox.instanceId);
    }
  }

  async getStreamingUrl(sandbox: SandboxRecord): Promise<string | null> {
    return sandbox.novncUrl ?? null;
  }

  private mapOperationalStatus(operationalStatus: string): MachineStatus["state"] {
    const statusMap: Record<string, MachineStatus["state"]> = {
      running: "running",
      starting: "starting",
      stopping: "stopping",
      stopped: "stopped",
      deleting: "stopping",
      deleted: "terminated",
    };
    return statusMap[operationalStatus] ?? "unknown";
  }
}
