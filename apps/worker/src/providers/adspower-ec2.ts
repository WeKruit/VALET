/**
 * AdsPowerEC2Provider - Tier 1 sandbox provider.
 *
 * Talks to an AdsPower instance running on an EC2 machine.
 * AdsPower exposes its local API on port 50325 — we reach it
 * from the Valet worker over HTTP (EC2 security group must allow it).
 *
 * Flow:
 *   1. Find or create an AdsPower browser profile for the user
 *   2. Optionally bind a proxy to the profile
 *   3. Start the browser → get the CDP WebSocket URL
 *   4. Return the CDP URL so engines (Stagehand, etc.) can connect
 *   5. On release → stop the browser (keep profile data for reuse)
 *
 * Env vars:
 *   ADSPOWER_API_URL   - e.g. http://10.0.1.5:50325 (REQUIRED)
 *   ADSPOWER_API_KEY   - optional bearer token
 *   ADSPOWER_GROUP_ID  - group for Valet profiles (optional, default "0")
 */

import pino from "pino";
import type {
  ISandboxProvider,
  SandboxProviderType,
  SandboxTier,
  ProvisionOptions,
  ProvisionResult,
} from "@valet/shared/types";
import { AdsPowerClient, type AdsPowerClientConfig } from "../clients/adspower.js";

const logger = pino({ name: "adspower-ec2-provider" });

export interface AdsPowerEC2ProviderConfig {
  /** AdsPower API base URL. Falls back to ADSPOWER_API_URL env var. */
  apiUrl?: string;
  /** Optional API key. Falls back to ADSPOWER_API_KEY env var. */
  apiKey?: string;
  /** AdsPower group ID for Valet profiles. Default: "0" */
  groupId?: string;
  /**
   * The host:port that engines will use to connect to CDP.
   * If AdsPower is remote (EC2), this should be the EC2 public/private IP.
   * AdsPower returns ws://127.0.0.1:PORT/... — we rewrite 127.0.0.1 to this host.
   * Falls back to ADSPOWER_CDP_HOST env var. If unset, uses the CDP URL as-is.
   */
  cdpHost?: string;
  /** Max concurrent browser profiles. Default: 5 */
  maxConcurrent?: number;
}

export class AdsPowerEC2Provider implements ISandboxProvider {
  readonly providerType: SandboxProviderType = "adspower-ec2";
  readonly tier: SandboxTier = 1;

  private readonly client: AdsPowerClient;
  private readonly groupId: string;
  private readonly cdpHost: string | null;
  private readonly maxConcurrent: number;

  /** Maps provisionResult session IDs to the AdsPower profile IDs */
  private activeSessions = new Map<string, string>();

  constructor(config?: AdsPowerEC2ProviderConfig) {
    const apiUrl =
      config?.apiUrl ?? process.env.ADSPOWER_API_URL;

    if (!apiUrl) {
      throw new Error(
        "AdsPowerEC2Provider requires ADSPOWER_API_URL env var or apiUrl config",
      );
    }

    const clientConfig: AdsPowerClientConfig = {
      baseUrl: apiUrl,
      apiKey: config?.apiKey ?? process.env.ADSPOWER_API_KEY,
      timeoutMs: 60_000, // browser start can be slow
      maxRetries: 2,
    };

    this.client = new AdsPowerClient(clientConfig);
    this.groupId = config?.groupId ?? process.env.ADSPOWER_GROUP_ID ?? "0";
    this.cdpHost = config?.cdpHost ?? process.env.ADSPOWER_CDP_HOST ?? null;
    this.maxConcurrent = config?.maxConcurrent ?? 5;
  }

  async provision(options: ProvisionOptions): Promise<ProvisionResult> {
    logger.info(
      {
        userId: options.userId,
        platform: options.platform,
        taskId: options.taskId,
      },
      "Provisioning AdsPower EC2 sandbox",
    );

    // Step 1: Find an existing profile or create a new one
    // Naming convention: valet-{userId}-{platform}
    const profileName = `valet-${options.userId.slice(0, 8)}-${options.platform}`;
    let profileId = await this.findExistingProfile(profileName);

    if (!profileId) {
      logger.info({ profileName }, "No existing profile found, creating new");
      const profile = await this.client.createProfile({
        name: profileName,
        groupId: this.groupId,
        proxyConfig: options.proxy,
      });
      profileId = profile.profileId;
      logger.info({ profileId, profileName }, "Profile created");
    } else {
      // Update proxy if provided
      if (options.proxy) {
        await this.client.updateProfileProxy(profileId, options.proxy);
      }
    }

    // Step 2: Start the browser
    const session = await this.client.startBrowser(profileId);

    // Step 3: Rewrite CDP URL if we have a cdpHost
    let cdpUrl = session.cdpUrl;
    if (this.cdpHost) {
      cdpUrl = cdpUrl.replace("127.0.0.1", this.cdpHost);
    }

    // Track for cleanup
    const sessionKey = `${options.taskId}-${profileId}`;
    this.activeSessions.set(sessionKey, profileId);

    logger.info(
      { profileId, cdpUrl, taskId: options.taskId },
      "AdsPower sandbox provisioned",
    );

    return {
      cdpUrl,
      session: {
        profileId,
        cdpUrl,
        port: session.port,
        pid: session.pid,
        startedAt: session.startedAt,
      },
      tier: this.tier,
      providerType: this.providerType,
      // TODO: interventionUrl for VNC when enableIntervention is true
    };
  }

  async release(result: ProvisionResult): Promise<void> {
    const profileId = result.session.profileId;

    logger.info({ profileId }, "Releasing AdsPower sandbox");

    try {
      await this.client.stopBrowser(profileId);
    } catch (err) {
      logger.warn(
        { profileId, error: String(err) },
        "Error stopping browser (may already be stopped)",
      );
    }

    // Clean up tracking
    for (const [key, pid] of this.activeSessions) {
      if (pid === profileId) {
        this.activeSessions.delete(key);
        break;
      }
    }

    logger.info({ profileId }, "AdsPower sandbox released");
  }

  async hasCapacity(): Promise<boolean> {
    try {
      const active = await this.client.listActive();
      return active.length < this.maxConcurrent;
    } catch {
      return false;
    }
  }

  async healthCheck(): Promise<{ healthy: boolean; message?: string }> {
    return this.client.healthCheck();
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private async findExistingProfile(name: string): Promise<string | null> {
    try {
      const { profiles } = await this.client.listProfiles(1, 100, this.groupId);
      const match = profiles.find((p) => p.name === name);
      return match?.profileId ?? null;
    } catch (err) {
      logger.warn(
        { error: String(err) },
        "Failed to list profiles, will create a new one",
      );
      return null;
    }
  }
}
