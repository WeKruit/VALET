import { describe, it, expect, vi } from "vitest";
import {
  SecurityLoggerService,
  SECURITY_EVENT_TYPES,
} from "../../src/services/security-logger.service";

function createMockLogger() {
  return {
    warn: vi.fn(),
    error: vi.fn(),
  };
}

describe("SecurityLoggerService", () => {
  it("logs AUTH_FAILURE events with warn level", () => {
    const logger = createMockLogger();
    const service = new SecurityLoggerService({ logger });

    service.logEvent(SECURITY_EVENT_TYPES.AUTH_FAILURE, {
      ip: "192.168.1.1",
      path: "/api/v1/tasks",
      reason: "Invalid token",
    });

    expect(logger.warn).toHaveBeenCalledTimes(1);
    const [logObj, msg] = logger.warn.mock.calls[0]!;
    expect(logObj.security).toBe(true);
    expect(logObj.event).toBe("AUTH_FAILURE");
    expect(logObj.ip).toBe("192.168.1.1");
    expect(logObj.path).toBe("/api/v1/tasks");
    expect(logObj.reason).toBe("Invalid token");
    expect(logObj.timestamp).toBeDefined();
    expect(msg).toBe("Security event: AUTH_FAILURE");
  });

  it("logs RATE_LIMIT_HIT events with warn level", () => {
    const logger = createMockLogger();
    const service = new SecurityLoggerService({ logger });

    service.logEvent(SECURITY_EVENT_TYPES.RATE_LIMIT_HIT, {
      userId: "user-123",
      ip: "10.0.0.1",
      path: "/api/v1/tasks",
      method: "POST",
    });

    expect(logger.warn).toHaveBeenCalledTimes(1);
    const [logObj] = logger.warn.mock.calls[0]!;
    expect(logObj.security).toBe(true);
    expect(logObj.event).toBe("RATE_LIMIT_HIT");
    expect(logObj.userId).toBe("user-123");
  });

  it("logs SUSPICIOUS_INPUT events", () => {
    const logger = createMockLogger();
    const service = new SecurityLoggerService({ logger });

    service.logEvent(SECURITY_EVENT_TYPES.SUSPICIOUS_INPUT, {
      ip: "1.2.3.4",
      userAgent: "curl/7.68.0",
      reason: "XSS attempt detected",
    });

    expect(logger.warn).toHaveBeenCalledTimes(1);
    const [logObj] = logger.warn.mock.calls[0]!;
    expect(logObj.event).toBe("SUSPICIOUS_INPUT");
    expect(logObj.userAgent).toBe("curl/7.68.0");
  });

  it("logs TOKEN_REVOKED events", () => {
    const logger = createMockLogger();
    const service = new SecurityLoggerService({ logger });

    service.logEvent(SECURITY_EVENT_TYPES.TOKEN_REVOKED, {
      userId: "user-456",
      reason: "User requested token revocation",
    });

    expect(logger.warn).toHaveBeenCalledTimes(1);
    const [logObj] = logger.warn.mock.calls[0]!;
    expect(logObj.event).toBe("TOKEN_REVOKED");
    expect(logObj.userId).toBe("user-456");
  });

  it("includes timestamp in every logged event", () => {
    const logger = createMockLogger();
    const service = new SecurityLoggerService({ logger });

    service.logEvent(SECURITY_EVENT_TYPES.ACCOUNT_LOCKED, {
      userId: "user-789",
    });

    const [logObj] = logger.warn.mock.calls[0]!;
    expect(logObj.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
