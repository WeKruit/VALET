import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getAnthropicProxyConfig,
  getAnthropicProxyReadiness,
  resetAnthropicProxyConfigCache,
} from "../anthropic-proxy-config.js";

const logger = {
  warn: vi.fn(),
} as any;

describe("anthropic-proxy-config", () => {
  beforeEach(() => {
    resetAnthropicProxyConfigCache();
    logger.warn.mockReset();
    process.env.ATM_BASE_URL = "https://atm.internal";
    process.env.VALET_ATM_TOKEN = "atm-service-token";
  });

  afterEach(() => {
    resetAnthropicProxyConfigCache();
    vi.unstubAllGlobals();
    delete process.env.ATM_BASE_URL;
    delete process.env.VALET_ATM_TOKEN;
    delete process.env.ATM_SERVICE_TOKEN;
  });

  it("fetches and caches Anthropic proxy config from ATM", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            provider: "anthropic",
            baseUrl: "https://api.anthropic.com",
            apiKey: "provider-secret",
            defaultModel: "claude-sonnet-4-20250514",
            allowedModels: ["claude-sonnet-4-20250514"],
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const first = await getAnthropicProxyConfig(logger);
    const second = await getAnthropicProxyConfig(logger);

    expect(first).toEqual({
      provider: "anthropic",
      baseUrl: "https://api.anthropic.com",
      apiKey: "provider-secret",
      defaultModel: "claude-sonnet-4-20250514",
      allowedModels: ["claude-sonnet-4-20250514"],
    });
    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://atm.internal/internal/llm-proxy-config?provider=anthropic",
      expect.objectContaining({
        headers: {
          Authorization: "Bearer atm-service-token",
        },
      }),
    );
  });

  it("reports runtime readiness failure when ATM config is unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 503 })),
    );

    const readiness = await getAnthropicProxyReadiness(logger);

    expect(readiness.llmRuntimeReady).toBe(false);
    expect(readiness.message).toContain("ATM runtime config request failed");
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });
});
