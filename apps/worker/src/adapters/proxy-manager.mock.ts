/**
 * Mock proxy manager.
 *
 * Simulates residential proxy assignment and IP rotation
 * with realistic proxy configurations.
 */
import type {
  IProxyManager,
  ProxyConfig,
  ProxyOptions,
} from "@valet/shared/types";
import { randomDelay, fakeId } from "./base.js";

export class ProxyManagerMock implements IProxyManager {
  private bindings = new Map<string, ProxyConfig>();

  async getProxy(options?: ProxyOptions): Promise<ProxyConfig> {
    await randomDelay(200, 500);
    return this.generateProxy(options?.country ?? "US");
  }

  async rotateIP(profileId: string): Promise<ProxyConfig> {
    await randomDelay(500, 1500);
    const proxy = this.generateProxy("US");
    this.bindings.set(profileId, proxy);
    return proxy;
  }

  async healthCheck(_proxy: ProxyConfig): Promise<boolean> {
    await randomDelay(300, 800);
    // 95% healthy
    return Math.random() > 0.05;
  }

  async bindToProfile(
    profileId: string,
    proxy: ProxyConfig,
  ): Promise<void> {
    await randomDelay(100, 300);
    this.bindings.set(profileId, proxy);
  }

  private generateProxy(country: string): ProxyConfig {
    const octets = Array.from({ length: 4 }, () =>
      Math.floor(Math.random() * 256),
    );
    return {
      host: `${octets.join(".")}`,
      port: 10000 + Math.floor(Math.random() * 50000),
      username: `user_${fakeId().slice(0, 8)}`,
      password: `pass_${fakeId().slice(0, 12)}`,
      protocol: "http",
      country,
      sessionId: `sticky_${fakeId().slice(0, 16)}`,
    };
  }
}
