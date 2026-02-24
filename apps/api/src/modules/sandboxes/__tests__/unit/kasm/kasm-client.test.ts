import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.hoisted runs before vi.mock hoisting, so fetchMock is available in the factory
const { fetchMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
}));

vi.mock("undici", () => ({
  Agent: vi.fn(),
  fetch: fetchMock,
}));

import { KasmClient } from "../../../kasm/kasm.client.js";

function makeMockLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn().mockReturnThis(),
    level: "info",
    silent: vi.fn(),
  };
}

describe("KasmClient", () => {
  let client: KasmClient;

  beforeEach(() => {
    fetchMock.mockReset();

    const logger = makeMockLogger();
    client = new KasmClient({
      kasmApiUrl: "https://kasm.example.com/api/public",
      kasmApiKey: "test-api-key",
      kasmApiKeySecret: "test-api-secret",
      logger: logger as never,
    });
  });

  describe("requestKasm", () => {
    it("sends correct request and returns response", async () => {
      const mockResponse = {
        kasm_id: "kasm-123",
        status: "starting",
        share_id: "share-456",
        username: "user1",
        kasm_url: "https://kasm.example.com/session/kasm-123",
        session_token: "token-abc",
        operational_status: "starting",
        hostname: "10.0.1.50",
        port_map: { "3100": { port: 32001, path: "/" } },
      };

      fetchMock.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await client.requestKasm({
        image_id: "img-001",
        user_id: "usr-001",
      });

      expect(result.kasm_id).toBe("kasm-123");
      expect(result.kasm_url).toBe("https://kasm.example.com/session/kasm-123");

      const [url, options] = fetchMock.mock.calls[0] as [string, { method: string; body: string }];
      expect(url).toBe("https://kasm.example.com/api/public/request_kasm");
      expect(options.method).toBe("POST");
      const body = JSON.parse(options.body as string) as Record<string, unknown>;
      expect(body.api_key).toBe("test-api-key");
      expect(body.api_key_secret).toBe("test-api-secret");
      expect(body.image_id).toBe("img-001");
      expect(body.user_id).toBe("usr-001");
    });
  });

  describe("getKasmStatus", () => {
    it("returns status for a given kasm_id", async () => {
      const mockResponse = {
        kasm: {
          kasm_id: "kasm-123",
          status: "running",
          operational_status: "running",
          hostname: "10.0.1.50",
          port_map: {},
          kasm_url: "https://kasm.example.com/session/kasm-123",
          image: { image_id: "img-001", friendly_name: "GH Worker" },
        },
      };

      fetchMock.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await client.getKasmStatus("kasm-123");

      expect(result.kasm.operational_status).toBe("running");
      expect(result.kasm.hostname).toBe("10.0.1.50");
    });
  });

  describe("destroyKasm", () => {
    it("sends destroy request", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });

      await client.destroyKasm("kasm-123");

      const [url, options] = fetchMock.mock.calls[0] as [string, { method: string; body: string }];
      expect(url).toBe("https://kasm.example.com/api/public/destroy_kasm");
      const body = JSON.parse(options.body as string) as Record<string, unknown>;
      expect(body.kasm_id).toBe("kasm-123");
    });
  });

  describe("keepalive", () => {
    it("sends keepalive request", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });

      await client.keepalive("kasm-123");

      const [url] = fetchMock.mock.calls[0] as [string];
      expect(url).toBe("https://kasm.example.com/api/public/keepalive");
    });
  });

  describe("error handling", () => {
    it("throws on non-OK response", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 403,
        text: () => Promise.resolve("Forbidden"),
      });

      await expect(client.getKasmStatus("kasm-123")).rejects.toThrow(
        "Kasm API error (403): Forbidden",
      );
    });
  });

  describe("TLS verification", () => {
    it("creates dispatcher when KASM_TLS_VERIFY=false", () => {
      const original = process.env.KASM_TLS_VERIFY;
      process.env.KASM_TLS_VERIFY = "false";

      const logger = makeMockLogger();
      const _tlsClient = new KasmClient({
        kasmApiUrl: "https://kasm.example.com/api/public",
        kasmApiKey: "key",
        kasmApiKeySecret: "secret",
        logger: logger as never,
      });

      // The warn log should have been called about TLS
      expect(logger.warn).toHaveBeenCalledWith(
        "Kasm TLS verification disabled (KASM_TLS_VERIFY=false)",
      );
      expect(_tlsClient).toBeDefined();

      // Restore
      if (original === undefined) {
        delete process.env.KASM_TLS_VERIFY;
      } else {
        process.env.KASM_TLS_VERIFY = original;
      }
    });

    it("does not create dispatcher when KASM_TLS_VERIFY is not false", () => {
      const original = process.env.KASM_TLS_VERIFY;
      delete process.env.KASM_TLS_VERIFY;

      const logger = makeMockLogger();
      new KasmClient({
        kasmApiUrl: "https://kasm.example.com/api/public",
        kasmApiKey: "key",
        kasmApiKeySecret: "secret",
        logger: logger as never,
      });

      expect(logger.warn).not.toHaveBeenCalled();

      // Restore
      if (original !== undefined) {
        process.env.KASM_TLS_VERIFY = original;
      }
    });
  });
});
