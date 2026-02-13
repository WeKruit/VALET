/**
 * Mock AdsPower client.
 *
 * Simulates AdsPower Local API responses for browser profile management.
 */
import type {
  IAdsPowerClient,
  ProfileOptions,
  ProfileInfo,
  ProfileStatus,
  BrowserSession,
} from "@valet/shared/types";
import { randomDelay, fakeId } from "./base.js";

export class AdsPowerMockClient implements IAdsPowerClient {
  private profiles = new Map<string, ProfileInfo>();
  private sessions = new Map<string, BrowserSession>();

  async createProfile(options: ProfileOptions): Promise<ProfileInfo> {
    await randomDelay(300, 700);
    const profileId = fakeId();
    const profile: ProfileInfo = {
      profileId,
      name: options.name ?? `Profile-${profileId.slice(0, 8)}`,
      status: "idle",
      groupId: options.groupId,
      createdAt: new Date().toISOString(),
    };
    this.profiles.set(profileId, profile);
    return profile;
  }

  async startBrowser(profileId: string): Promise<BrowserSession> {
    await randomDelay(1500, 3000); // browser start is slow
    const profile = this.profiles.get(profileId);
    if (!profile) {
      throw new Error(`Profile not found: ${profileId}`);
    }
    profile.status = "running";
    profile.lastUsedAt = new Date().toISOString();

    const session: BrowserSession = {
      profileId,
      cdpUrl: `ws://127.0.0.1:${9222 + this.sessions.size}/devtools/browser/${fakeId()}`,
      port: 9222 + this.sessions.size,
      pid: 10000 + Math.floor(Math.random() * 50000),
      startedAt: new Date().toISOString(),
    };
    this.sessions.set(profileId, session);
    return session;
  }

  async stopBrowser(profileId: string): Promise<void> {
    await randomDelay(500, 1000);
    const profile = this.profiles.get(profileId);
    if (profile) {
      profile.status = "idle";
    }
    this.sessions.delete(profileId);
  }

  async listActive(): Promise<ProfileInfo[]> {
    await randomDelay(100, 300);
    return Array.from(this.profiles.values()).filter(
      (p) => p.status === "running",
    );
  }

  async getProfileStatus(profileId: string): Promise<ProfileStatus> {
    await randomDelay(100, 200);
    const profile = this.profiles.get(profileId);
    if (!profile) {
      throw new Error(`Profile not found: ${profileId}`);
    }
    return profile.status;
  }
}
