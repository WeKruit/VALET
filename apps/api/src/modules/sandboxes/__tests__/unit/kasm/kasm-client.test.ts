import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const logger = makeMockLogger();
    client = new KasmClient({
      kasmApiUrl: "https://kasm.example.com/api/public",
      kasmApiKey: "test-api-key",
      kasmApiKeySecret: "test-api-secret",
      logger: logger as never,
    });

    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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
});
