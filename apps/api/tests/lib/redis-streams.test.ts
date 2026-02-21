/**
 * Unit tests for redis-streams utilities.
 */
import { describe, it, expect } from "vitest";
import { parseStreamFields, streamKey } from "../../src/lib/redis-streams.js";

describe("streamKey", () => {
  it("builds canonical stream key from jobId", () => {
    expect(streamKey("abc-123")).toBe("gh:events:abc-123");
  });
});

describe("parseStreamFields", () => {
  it("parses a complete field array into a typed event object", () => {
    const fields = [
      "step",
      "filling_form",
      "progress_pct",
      "45",
      "description",
      "Filling out application form",
      "action_index",
      "3",
      "total_actions_estimate",
      "10",
      "current_action",
      "Typing name",
      "started_at",
      "2026-02-20T00:00:00.000Z",
      "elapsed_ms",
      "12000",
      "eta_ms",
      "15000",
      "execution_mode",
      "cookbook",
      "manual_id",
      "manual-1",
      "step_cost_cents",
      "5",
      "timestamp",
      "2026-02-20T00:00:12.000Z",
    ];

    const result = parseStreamFields("1708000000000-0", fields);

    expect(result).toEqual({
      id: "1708000000000-0",
      step: "filling_form",
      progress_pct: 45,
      description: "Filling out application form",
      action_index: 3,
      total_actions_estimate: 10,
      current_action: "Typing name",
      started_at: "2026-02-20T00:00:00.000Z",
      elapsed_ms: 12000,
      eta_ms: 15000,
      execution_mode: "cookbook",
      manual_id: "manual-1",
      step_cost_cents: 5,
      timestamp: "2026-02-20T00:00:12.000Z",
    });
  });

  it("handles missing optional fields gracefully", () => {
    const fields = [
      "step",
      "navigating",
      "progress_pct",
      "10",
      "description",
      "Opening page",
      "action_index",
      "1",
      "total_actions_estimate",
      "8",
      "started_at",
      "2026-02-20T00:00:00.000Z",
      "elapsed_ms",
      "500",
      "timestamp",
      "2026-02-20T00:00:00.500Z",
    ];

    const result = parseStreamFields("100-0", fields);

    expect(result.id).toBe("100-0");
    expect(result.step).toBe("navigating");
    expect(result.current_action).toBeUndefined();
    expect(result.eta_ms).toBeNull();
    expect(result.execution_mode).toBeUndefined();
    expect(result.manual_id).toBeUndefined();
    expect(result.step_cost_cents).toBeUndefined();
  });

  it("defaults step to 'unknown' when missing", () => {
    const fields = [
      "progress_pct",
      "0",
      "description",
      "",
      "action_index",
      "0",
      "total_actions_estimate",
      "0",
      "started_at",
      "",
      "elapsed_ms",
      "0",
      "timestamp",
      "2026-02-20T00:00:00.000Z",
    ];

    const result = parseStreamFields("200-0", fields);
    expect(result.step).toBe("unknown");
  });

  it("handles empty field array", () => {
    const result = parseStreamFields("300-0", []);

    expect(result.id).toBe("300-0");
    expect(result.step).toBe("unknown");
    expect(result.progress_pct).toBe(0);
    expect(result.description).toBe("");
    expect(result.action_index).toBe(0);
    expect(result.total_actions_estimate).toBe(0);
    expect(result.elapsed_ms).toBe(0);
    expect(result.eta_ms).toBeNull();
  });

  it("converts numeric string fields to numbers", () => {
    const fields = [
      "step",
      "submitting",
      "progress_pct",
      "99.5",
      "description",
      "Submitting",
      "action_index",
      "9",
      "total_actions_estimate",
      "10",
      "started_at",
      "2026-02-20T00:00:00.000Z",
      "elapsed_ms",
      "55000",
      "eta_ms",
      "1000",
      "step_cost_cents",
      "12",
      "timestamp",
      "2026-02-20T00:00:55.000Z",
    ];

    const result = parseStreamFields("400-0", fields);

    expect(typeof result.progress_pct).toBe("number");
    expect(typeof result.action_index).toBe("number");
    expect(typeof result.total_actions_estimate).toBe("number");
    expect(typeof result.elapsed_ms).toBe("number");
    expect(typeof result.eta_ms).toBe("number");
    expect(typeof result.step_cost_cents).toBe("number");
    expect(result.progress_pct).toBe(99.5);
    expect(result.eta_ms).toBe(1000);
    expect(result.step_cost_cents).toBe(12);
  });
});
