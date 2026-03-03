import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { browserSessionTokenStore } from "../../browser-session-token-store.js";

/**
 * Tests for browser session token lifecycle:
 * - Token TTL enforcement
 * - Event-driven invalidation
 * - Cleanup idempotency when both TTL and invalidation fire
 *
 * These tests exercise the exact contract that browser-session-ws.routes.ts
 * depends on: token validation, event emission on invalidation, and TTL expiry.
 */

describe("BrowserSessionTokenStore — lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    // Clear all tokens between tests (avoid cross-test pollution)
    browserSessionTokenStore.invalidateByTaskId("task-1");
    browserSessionTokenStore.invalidateByTaskId("task-2");
    browserSessionTokenStore.events.removeAllListeners();
  });

  // ── Token TTL ──

  it("validate() returns the token within TTL", () => {
    const entry = browserSessionTokenStore.mint(
      { taskId: "task-1", ghJobId: "job-1", workerIp: "10.0.0.1" },
      5_000,
    );

    expect(browserSessionTokenStore.validate(entry.token)).toBeTruthy();
  });

  it("validate() returns null after TTL expires", () => {
    const entry = browserSessionTokenStore.mint(
      { taskId: "task-1", ghJobId: "job-1", workerIp: "10.0.0.1" },
      5_000,
    );

    vi.advanceTimersByTime(5_001);
    expect(browserSessionTokenStore.validate(entry.token)).toBeNull();
  });

  it("expiresAt is set correctly based on TTL", () => {
    const now = Date.now();
    const entry = browserSessionTokenStore.mint(
      { taskId: "task-1", ghJobId: "job-1", workerIp: "10.0.0.1" },
      300_000, // 5 minutes
    );

    const expectedExpiry = now + 300_000;
    // Allow 100ms tolerance for test execution time
    expect(Math.abs(entry.expiresAt.getTime() - expectedExpiry)).toBeLessThan(100);
  });

  // ── Event-driven invalidation ──

  it("invalidateByTaskId emits invalidated:{taskId} event", () => {
    const handler = vi.fn();
    browserSessionTokenStore.events.on("invalidated:task-1", handler);

    browserSessionTokenStore.mint(
      { taskId: "task-1", ghJobId: "job-1", workerIp: "10.0.0.1" },
      60_000,
    );

    browserSessionTokenStore.invalidateByTaskId("task-1");
    expect(handler).toHaveBeenCalledOnce();
  });

  it("invalidateByTaskId does NOT emit when no tokens exist for that task", () => {
    const handler = vi.fn();
    browserSessionTokenStore.events.on("invalidated:task-1", handler);

    // Mint a token for a different task
    browserSessionTokenStore.mint(
      { taskId: "task-2", ghJobId: "job-2", workerIp: "10.0.0.1" },
      60_000,
    );

    browserSessionTokenStore.invalidateByTaskId("task-1");
    expect(handler).not.toHaveBeenCalled();
  });

  it("invalidateByTaskId removes the token from the store", () => {
    const entry = browserSessionTokenStore.mint(
      { taskId: "task-1", ghJobId: "job-1", workerIp: "10.0.0.1" },
      60_000,
    );

    browserSessionTokenStore.invalidateByTaskId("task-1");
    expect(browserSessionTokenStore.validate(entry.token)).toBeNull();
  });

  it("invalidateByTaskId invalidates all tokens for the same task", () => {
    const entry1 = browserSessionTokenStore.mint(
      { taskId: "task-1", ghJobId: "job-1", workerIp: "10.0.0.1" },
      60_000,
    );
    const entry2 = browserSessionTokenStore.mint(
      { taskId: "task-1", ghJobId: "job-1", workerIp: "10.0.0.1" },
      60_000,
    );

    browserSessionTokenStore.invalidateByTaskId("task-1");
    expect(browserSessionTokenStore.validate(entry1.token)).toBeNull();
    expect(browserSessionTokenStore.validate(entry2.token)).toBeNull();
  });

  it("invalidateByTaskId does not affect tokens for other tasks", () => {
    browserSessionTokenStore.mint(
      { taskId: "task-1", ghJobId: "job-1", workerIp: "10.0.0.1" },
      60_000,
    );
    const other = browserSessionTokenStore.mint(
      { taskId: "task-2", ghJobId: "job-2", workerIp: "10.0.0.2" },
      60_000,
    );

    browserSessionTokenStore.invalidateByTaskId("task-1");
    expect(browserSessionTokenStore.validate(other.token)).toBeTruthy();
  });

  // ── Simulated WS route lifecycle ──
  //
  // These tests model the exact timer + listener pattern from browser-session-ws.routes.ts
  // without requiring a real Fastify/WebSocket server.

  it("TTL timer fires and closes socket when token expires (simulated WS route)", () => {
    const entry = browserSessionTokenStore.mint(
      { taskId: "task-1", ghJobId: "job-1", workerIp: "10.0.0.1" },
      5_000, // 5 second TTL for test
    );

    const socketClose = vi.fn();
    const cdpClose = vi.fn();
    const listenerRemove = vi.fn();

    // Simulate the WS route setup
    let cleaned = false;
    const ttlMs = Math.max(0, entry.expiresAt.getTime() - Date.now());
    const expiryTimer = setTimeout(() => {
      cleanup();
      socketClose(4002, "Session expired");
      cdpClose();
    }, ttlMs);

    function onTokenInvalidated() {
      cleanup();
      socketClose(4002, "Session expired");
      cdpClose();
    }

    function cleanup() {
      if (cleaned) return;
      cleaned = true;
      clearTimeout(expiryTimer);
      browserSessionTokenStore.events.removeListener(
        `invalidated:${entry.taskId}`,
        onTokenInvalidated,
      );
      listenerRemove();
    }

    browserSessionTokenStore.events.on(`invalidated:${entry.taskId}`, onTokenInvalidated);

    // Nothing fired yet
    expect(socketClose).not.toHaveBeenCalled();

    // Advance past TTL
    vi.advanceTimersByTime(5_001);

    expect(socketClose).toHaveBeenCalledWith(4002, "Session expired");
    expect(cdpClose).toHaveBeenCalledOnce();
    expect(listenerRemove).toHaveBeenCalledOnce();
  });

  it("invalidateByTaskId fires and closes socket immediately (simulated WS route)", () => {
    const entry = browserSessionTokenStore.mint(
      { taskId: "task-1", ghJobId: "job-1", workerIp: "10.0.0.1" },
      300_000, // 5 minute TTL
    );

    const socketClose = vi.fn();
    const cdpClose = vi.fn();

    // Simulate the WS route setup
    let cleaned = false;
    const expiryTimer = setTimeout(
      () => {
        cleanup();
        socketClose(4002, "Session expired");
        cdpClose();
      },
      Math.max(0, entry.expiresAt.getTime() - Date.now()),
    );

    function onTokenInvalidated() {
      cleanup();
      socketClose(4002, "Session expired");
      cdpClose();
    }

    function cleanup() {
      if (cleaned) return;
      cleaned = true;
      clearTimeout(expiryTimer);
      browserSessionTokenStore.events.removeListener(
        `invalidated:${entry.taskId}`,
        onTokenInvalidated,
      );
    }

    browserSessionTokenStore.events.on(`invalidated:${entry.taskId}`, onTokenInvalidated);

    // Simulate task resuming after 10 seconds (well before 5min TTL)
    vi.advanceTimersByTime(10_000);
    browserSessionTokenStore.invalidateByTaskId("task-1");

    expect(socketClose).toHaveBeenCalledWith(4002, "Session expired");
    expect(cdpClose).toHaveBeenCalledOnce();
  });

  it("cleanup is idempotent: TTL timer after invalidation does not double-close", () => {
    const entry = browserSessionTokenStore.mint(
      { taskId: "task-1", ghJobId: "job-1", workerIp: "10.0.0.1" },
      5_000, // 5 second TTL
    );

    const socketClose = vi.fn();
    const cdpClose = vi.fn();

    // Simulate the WS route setup
    let cleaned = false;
    const expiryTimer = setTimeout(
      () => {
        cleanup();
        socketClose(4002, "Session expired");
        cdpClose();
      },
      Math.max(0, entry.expiresAt.getTime() - Date.now()),
    );

    function onTokenInvalidated() {
      cleanup();
      socketClose(4002, "Session expired");
      cdpClose();
    }

    function cleanup() {
      if (cleaned) return;
      cleaned = true;
      clearTimeout(expiryTimer);
      browserSessionTokenStore.events.removeListener(
        `invalidated:${entry.taskId}`,
        onTokenInvalidated,
      );
    }

    browserSessionTokenStore.events.on(`invalidated:${entry.taskId}`, onTokenInvalidated);

    // First: invalidation fires at 2 seconds
    vi.advanceTimersByTime(2_000);
    browserSessionTokenStore.invalidateByTaskId("task-1");
    expect(socketClose).toHaveBeenCalledOnce();
    expect(cdpClose).toHaveBeenCalledOnce();

    // Then: TTL timer would have fired at 5 seconds — but cleanup already ran
    vi.advanceTimersByTime(5_000);

    // Still only called once — no double-close
    expect(socketClose).toHaveBeenCalledOnce();
    expect(cdpClose).toHaveBeenCalledOnce();
  });

  it("cleanup is idempotent: invalidation after TTL expiry does not double-close", () => {
    const entry = browserSessionTokenStore.mint(
      { taskId: "task-1", ghJobId: "job-1", workerIp: "10.0.0.1" },
      5_000, // 5 second TTL
    );

    const socketClose = vi.fn();
    const cdpClose = vi.fn();

    // Simulate the WS route setup
    let cleaned = false;
    const expiryTimer = setTimeout(
      () => {
        cleanup();
        socketClose(4002, "Session expired");
        cdpClose();
      },
      Math.max(0, entry.expiresAt.getTime() - Date.now()),
    );

    function onTokenInvalidated() {
      cleanup();
      socketClose(4002, "Session expired");
      cdpClose();
    }

    function cleanup() {
      if (cleaned) return;
      cleaned = true;
      clearTimeout(expiryTimer);
      browserSessionTokenStore.events.removeListener(
        `invalidated:${entry.taskId}`,
        onTokenInvalidated,
      );
    }

    browserSessionTokenStore.events.on(`invalidated:${entry.taskId}`, onTokenInvalidated);

    // First: TTL timer fires at 5 seconds
    vi.advanceTimersByTime(5_001);
    expect(socketClose).toHaveBeenCalledOnce();
    expect(cdpClose).toHaveBeenCalledOnce();

    // Then: invalidation fires (e.g., webhook received after timeout)
    // Note: token already deleted by TTL, so invalidateByTaskId won't emit
    // But even if it did (via a second minted token), cleanup would no-op
    browserSessionTokenStore.invalidateByTaskId("task-1");

    // Still only called once — no double-close
    expect(socketClose).toHaveBeenCalledOnce();
    expect(cdpClose).toHaveBeenCalledOnce();
  });

  it("near-simultaneous TTL and invalidation: only one close fires", () => {
    const entry = browserSessionTokenStore.mint(
      { taskId: "task-1", ghJobId: "job-1", workerIp: "10.0.0.1" },
      100, // 100ms TTL — near-simultaneous with invalidation
    );

    const socketClose = vi.fn();
    const cdpClose = vi.fn();

    let cleaned = false;
    const expiryTimer = setTimeout(
      () => {
        cleanup();
        socketClose(4002, "Session expired");
        cdpClose();
      },
      Math.max(0, entry.expiresAt.getTime() - Date.now()),
    );

    function onTokenInvalidated() {
      cleanup();
      socketClose(4002, "Session expired");
      cdpClose();
    }

    function cleanup() {
      if (cleaned) return;
      cleaned = true;
      clearTimeout(expiryTimer);
      browserSessionTokenStore.events.removeListener(
        `invalidated:${entry.taskId}`,
        onTokenInvalidated,
      );
    }

    browserSessionTokenStore.events.on(`invalidated:${entry.taskId}`, onTokenInvalidated);

    // Fire invalidation at exactly 100ms (same time as TTL)
    vi.advanceTimersByTime(100);
    browserSessionTokenStore.invalidateByTaskId("task-1");

    // Exactly one close, not two
    expect(socketClose).toHaveBeenCalledOnce();
    expect(cdpClose).toHaveBeenCalledOnce();
  });
});
