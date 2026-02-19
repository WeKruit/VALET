import type { SandboxProvider, SandboxMachineType } from "./sandbox-provider.interface.js";
import type { SandboxRecord } from "../sandbox.repository.js";

export class SandboxProviderFactory {
  private providers: Map<SandboxMachineType, SandboxProvider>;

  constructor(providers: SandboxProvider[]) {
    this.providers = new Map(providers.map((p) => [p.type, p]));
  }

  /** Get the provider for a given sandbox based on its machine_type */
  getProvider(sandbox: SandboxRecord): SandboxProvider {
    const type = (sandbox.machineType ?? "ec2") as SandboxMachineType;
    const provider = this.providers.get(type);
    if (!provider) {
      throw new Error(`No sandbox provider registered for machine type: ${type}`);
    }
    return provider;
  }

  /** Get the provider for a machine type directly */
  getByType(type: SandboxMachineType): SandboxProvider {
    const provider = this.providers.get(type);
    if (!provider) {
      throw new Error(`No sandbox provider registered for machine type: ${type}`);
    }
    return provider;
  }
}
