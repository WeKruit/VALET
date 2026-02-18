/**
 * Provider factory - creates ISandboxProvider instances by tier.
 */

import type { ISandboxProvider, SandboxTier } from "@valet/shared/types";
import { AdsPowerEC2Provider } from "./adspower-ec2.js";
import { BrowserbaseProvider } from "./browserbase.js";

/**
 * Create a sandbox provider for the given tier.
 *
 * Tiers 3 (Fly Machine) and 4 (API Direct) will be added as their
 * implementations are built.
 */
export function createProvider(tier: SandboxTier): ISandboxProvider {
  switch (tier) {
    case 1:
      return new AdsPowerEC2Provider();
    case 2:
      return new BrowserbaseProvider();
    case 3:
      // TODO: FlyMachineProvider
      throw new Error("Tier 3 (Fly Machine) provider not yet implemented");
    case 4:
      // TODO: ApiDirectProvider
      throw new Error("Tier 4 (API Direct) provider not yet implemented");
    default: {
      const _exhaustive: never = tier;
      throw new Error(`Unknown tier: ${String(_exhaustive)}`);
    }
  }
}
