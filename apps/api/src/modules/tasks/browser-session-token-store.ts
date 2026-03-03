import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";

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

  /**
   * Emits `invalidated:${taskId}` when tokens for a task are invalidated.
   * WebSocket routes subscribe to close active sockets immediately.
   */
  readonly events = new EventEmitter();

  constructor(cleanupIntervalMs = 60_000) {
    this.cleanupInterval = setInterval(() => this.cleanup(), cleanupIntervalMs);
    // Avoid Node warning when many concurrent browser sessions subscribe
    this.events.setMaxListeners(100);
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
    let found = false;
    for (const [key, entry] of this.tokens) {
      if (entry.taskId === taskId) {
        this.tokens.delete(key);
        found = true;
      }
    }
    if (found) {
      this.events.emit(`invalidated:${taskId}`);
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
    this.events.removeAllListeners();
  }
}

export const browserSessionTokenStore = new BrowserSessionTokenStore();
