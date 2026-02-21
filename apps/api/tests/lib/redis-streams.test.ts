import { describe, it, expect } from "vitest";
import { parseStreamFields, streamKey } from "../../src/lib/redis-streams.js";

describe("streamKey", () => {
  it("returns correct key format", () => {
    expect(streamKey("abc-123")).toBe("gh:events:abc-123");
  });
});

describe("parseStreamFields", () => {
  it("parses key-value pairs correctly", () => {
    const fields = ["step", "filling", "progress_pct", "45", "description", "Filling forms"];
    const result = parseStreamFields(fields);
    expect(result).toEqual({
      step: "filling",
      progress_pct: "45",
      description: "Filling forms",
    });
  });

  it("handles empty array", () => {
    expect(parseStreamFields([])).toEqual({});
  });

  it("handles odd-length array (missing last value)", () => {
    const fields = ["step", "filling", "orphan"];
    const result = parseStreamFields(fields);
    expect(result.step).toBe("filling");
    expect(result.orphan).toBe("");
  });
});
