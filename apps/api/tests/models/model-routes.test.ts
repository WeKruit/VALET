import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GhostHandsClient } from "../../src/modules/ghosthands/ghosthands.client.js";

describe("GhostHandsClient.getModels", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function makeClient() {
    return new GhostHandsClient({
      ghosthandsApiUrl: "http://localhost:3100",
      ghosthandsServiceKey: "test-key",
      logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any,
    });
  }

  it("calls GET /api/v1/gh/models with service key", async () => {
    const mockCatalog = {
      models: [{ id: "claude-3", name: "Claude 3", provider: "anthropic", purpose: "reasoning" }],
      default_reasoning_model: "claude-3",
    };

    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockCatalog,
    });

    const client = makeClient();
    const result = await client.getModels();

    expect(result).toEqual(mockCatalog);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3100/api/v1/gh/models",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          "X-GH-Service-Key": "test-key",
        }),
      }),
    );
  });

  it("throws on non-OK response", async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      text: async () => "server error",
    });

    const client = makeClient();
    await expect(client.getModels()).rejects.toThrow("GhostHands API error");
  });
});
