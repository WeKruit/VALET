import { randomUUID } from "node:crypto";

export interface BrowserSessionToken {
  token: string;
  taskId: string;
  ghJobId: string;
  workerIp: string;
  fleetId?: string;
  expiresAt: Date;
  pageUrl?: string;
  pageTitle?: string;
}

class BrowserSessionTokenStore {
  private tokens = new Map<string, BrowserSessionToken>();
  private cleanupInterval: ReturnType<typeof setInterval>;

  constructor(cleanupIntervalMs = 60_000) {
    this.cleanupInterval = setInterval(() => this.cleanup(), cleanupIntervalMs);
  }

  mint(
    data: Omit<BrowserSessionToken, "token" | "expiresAt">,
    ttlMs = 5 * 60 * 1000,
  ): BrowserSessionToken {
    const token = randomUUID();
    const entry: BrowserSessionToken = {
      ...data,
      token,
      expiresAt: new Date(Date.now() + ttlMs),
    };
    this.tokens.set(token, entry);
    return entry;
  }

  validate(token: string): BrowserSessionToken | null {
    const entry = this.tokens.get(token);
    if (!entry) return null;
    if (entry.expiresAt < new Date()) {
      this.tokens.delete(token);
      return null;
    }
    return entry;
  }

  invalidateByTaskId(taskId: string): void {
    for (const [key, entry] of this.tokens) {
      if (entry.taskId === taskId) this.tokens.delete(key);
    }
  }

  private cleanup(): void {
    const now = new Date();
    for (const [key, entry] of this.tokens) {
      if (entry.expiresAt < now) this.tokens.delete(key);
    }
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.tokens.clear();
  }
}

export const browserSessionTokenStore = new BrowserSessionTokenStore();
