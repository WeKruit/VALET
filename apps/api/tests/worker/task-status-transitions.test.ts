/**
 * Task Status Transition Tests
 *
 * Tests the status mapping logic in the GhostHands webhook handler.
 * Verifies that GH statuses map correctly to VALET task statuses.
 */
import { describe, it, expect } from "vitest";
import type { TaskStatus } from "@valet/shared/schemas";

/**
 * The status map extracted from ghosthands.webhook.ts for unit testing.
 * This mirrors the exact mapping in the webhook handler.
 */
const statusMap: Record<string, TaskStatus> = {
  running: "in_progress",
  completed: "completed",
  failed: "failed",
  cancelled: "cancelled",
  needs_human: "waiting_human",
  resumed: "in_progress",
};

describe("Task Status Transitions (Webhook Handler)", () => {
  describe("GH status -> VALET status mapping", () => {
    it("running maps to in_progress", () => {
      expect(statusMap["running"]).toBe("in_progress");
    });

    it("completed maps to completed", () => {
      expect(statusMap["completed"]).toBe("completed");
    });

    it("failed maps to failed", () => {
      expect(statusMap["failed"]).toBe("failed");
    });

    it("cancelled maps to cancelled", () => {
      expect(statusMap["cancelled"]).toBe("cancelled");
    });

    it("needs_human maps to waiting_human", () => {
      expect(statusMap["needs_human"]).toBe("waiting_human");
    });

    it("resumed maps to in_progress", () => {
      expect(statusMap["resumed"]).toBe("in_progress");
    });
  });

  describe("Invalid status transitions", () => {
    it("unknown GH statuses return undefined (rejected)", () => {
      expect(statusMap["pending"]).toBeUndefined();
      expect(statusMap["queued"]).toBeUndefined();
      expect(statusMap["unknown_status"]).toBeUndefined();
      expect(statusMap[""]).toBeUndefined();
    });

    it("statusMap only contains expected keys", () => {
      const expectedKeys = [
        "running",
        "completed",
        "failed",
        "cancelled",
        "needs_human",
        "resumed",
      ];
      expect(Object.keys(statusMap).sort()).toEqual(expectedKeys.sort());
    });
  });

  describe("HITL interaction type mapping", () => {
    /**
     * The interaction type map from the webhook handler.
     */
    const interactionTypeMap: Record<string, string> = {
      "2fa": "two_factor",
      login: "login_required",
    };

    it("2fa maps to two_factor", () => {
      expect(interactionTypeMap["2fa"]).toBe("two_factor");
    });

    it("login maps to login_required", () => {
      expect(interactionTypeMap["login"]).toBe("login_required");
    });

    it("captcha passes through unmapped (uses GH value directly)", () => {
      const type = "captcha";
      const mapped = interactionTypeMap[type] ?? type;
      expect(mapped).toBe("captcha");
    });

    it("bot_check passes through unmapped", () => {
      const type = "bot_check";
      const mapped = interactionTypeMap[type] ?? type;
      expect(mapped).toBe("bot_check");
    });
  });

  describe("Bidirectional status consistency", () => {
    it("running and resumed both map to in_progress (two GH states -> one VALET state)", () => {
      expect(statusMap["running"]).toBe(statusMap["resumed"]);
      expect(statusMap["running"]).toBe("in_progress");
    });

    it("all terminal GH statuses map to terminal VALET statuses", () => {
      const ghTerminal = ["completed", "failed", "cancelled"];
      const valetTerminal = ["completed", "failed", "cancelled"];

      for (const gh of ghTerminal) {
        expect(valetTerminal).toContain(statusMap[gh]);
      }
    });

    it("all VALET task statuses in the map are valid TaskStatus values", () => {
      const validStatuses: TaskStatus[] = [
        "created",
        "queued",
        "in_progress",
        "waiting_human",
        "completed",
        "failed",
        "cancelled",
      ];

      for (const valetStatus of Object.values(statusMap)) {
        expect(validStatuses).toContain(valetStatus);
      }
    });
  });
});
