import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SecretsSyncService } from "../../src/modules/secrets/secrets-sync.service.js";

// ─── Mocks ────────────────────────────────────────────────────────────

// Mock fs.readFileSync for .env parsing
vi.mock("node:fs", () => ({
  readFileSync: vi.fn((filePath: string) => {
    if (filePath.includes(".env.staging")) {
      return [
        "DATABASE_URL=postgres://staging",
        "JWT_SECRET=staging-jwt-secret",
        "REDIS_URL=redis://staging",
        "SUPABASE_URL=https://supabase.staging",
        "SUPABASE_SECRET_KEY=sb-secret",
        "GH_SERVICE_SECRET=gh-service-key",
        "VITE_API_URL=https://api.staging",
      ].join("\n");
    }
    return "";
  }),
}));

// Mock libsodium-wrappers
vi.mock("libsodium-wrappers", () => {
  const mockSodium = {
    ready: Promise.resolve(),
    from_base64: vi.fn(() => new Uint8Array(32)),
    from_string: vi.fn((s: string) => new TextEncoder().encode(s)),
    crypto_box_seal: vi.fn(() => new Uint8Array(48)),
    to_base64: vi.fn(() => "encrypted-base64-value"),
    base64_variants: { ORIGINAL: 0 },
  };
  return { default: mockSodium };
});

// Mock AWS SDK
const mockAwsSend = vi.fn();
vi.mock("@aws-sdk/client-secrets-manager", () => ({
  SecretsManagerClient: vi.fn().mockImplementation(() => ({
    send: mockAwsSend,
  })),
  GetSecretValueCommand: vi.fn().mockImplementation((input: unknown) => ({
    _type: "Get",
    input,
  })),
  PutSecretValueCommand: vi.fn().mockImplementation((input: unknown) => ({
    _type: "Put",
    input,
  })),
}));

// Mock global fetch — route-based instead of order-based
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Mock DB
const mockDbValues = vi.fn().mockResolvedValue(undefined);
const mockDbInsert = vi.fn().mockReturnValue({ values: mockDbValues });
const mockDb = {
  insert: mockDbInsert,
  select: vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

// ─── URL-based fetch router ──────────────────────────────────────────

interface FetchRoute {
  pattern: string | RegExp;
  method?: string;
  response?: { ok: boolean; status?: number; json?: unknown; text?: string };
  error?: Error;
}

function setupFetchRouter(routes: FetchRoute[]) {
  mockFetch.mockImplementation((url: string, init?: globalThis.RequestInit) => {
    const method = init?.method ?? "GET";
    for (const route of routes) {
      const urlMatch =
        typeof route.pattern === "string" ? url.includes(route.pattern) : route.pattern.test(url);
      const methodMatch = !route.method || route.method === method;
      if (urlMatch && methodMatch) {
        if (route.error) return Promise.reject(route.error);
        const resp = route.response!;
        return Promise.resolve({
          ok: resp.ok,
          status: resp.status ?? (resp.ok ? 200 : 500),
          json: () => Promise.resolve(resp.json ?? {}),
          text: () => Promise.resolve(resp.text ?? ""),
        });
      }
    }
    // Default: return 404
    return Promise.resolve({
      ok: false,
      status: 404,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve("Not found"),
    });
  });
}

const AWS_EXISTING_SECRET = { DATABASE_URL: "postgres://staging" };

// ─── Tests ────────────────────────────────────────────────────────────

describe("SecretsSyncService", () => {
  let service: SecretsSyncService;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.FLY_API_TOKEN = "fly-test-token";
    process.env.GITHUB_TOKEN = "gh-test-token";
    process.env.AWS_REGION = "us-east-1";
    process.env.MONOREPO_ROOT = "/fake/monorepo";

    service = new SecretsSyncService({ logger: mockLogger, db: mockDb });
  });

  afterEach(() => {
    delete process.env.FLY_API_TOKEN;
    delete process.env.GITHUB_TOKEN;
    delete process.env.AWS_REGION;
    delete process.env.MONOREPO_ROOT;
  });

  describe("syncFlyApp", () => {
    it("pushes missing secrets to Fly.io Machines API", async () => {
      setupFetchRouter([
        // Diff: list secrets (GET) — returns only DATABASE_URL → drifted
        {
          pattern: "api.machines.dev",
          method: "GET",
          response: { ok: true, json: [{ label: "DATABASE_URL" }] },
        },
        // Sync: push secrets (POST) — success
        { pattern: "api.machines.dev", method: "POST", response: { ok: true, json: {} } },
        // GH diff
        {
          pattern: "api.github.com/repos/WeKruit/GHOST-HANDS/actions/secrets",
          method: "GET",
          response: { ok: true, json: { secrets: [{ name: "SUPABASE_URL" }] } },
        },
      ]);
      mockAwsSend.mockResolvedValue({ SecretString: JSON.stringify(AWS_EXISTING_SECRET) });

      const result = await service.sync("staging", "test-user", ["valet-api-stg"]);
      const flyResult = result.results.find((r) => r.target === "valet-api-stg");

      expect(flyResult).toBeDefined();
      expect(flyResult!.success).toBe(true);
      expect(flyResult!.pushed).toBeGreaterThan(0);

      // Verify POST to Fly Machines API was called
      const postCalls = mockFetch.mock.calls.filter(
        (c) => (c[0] as string).includes("api.machines.dev") && c[1]?.method === "POST",
      );
      expect(postCalls.length).toBe(1);

      // Verify body has secrets array with label/value/type
      const body = JSON.parse(postCalls[0]![1].body);
      expect(Array.isArray(body)).toBe(true);
      expect(body[0]).toHaveProperty("label");
      expect(body[0]).toHaveProperty("value");
      expect(body[0].type).toBe("secret");
    });

    it("returns error when FLY_API_TOKEN is not set", async () => {
      delete process.env.FLY_API_TOKEN;

      setupFetchRouter([
        { pattern: "api.github.com", response: { ok: true, json: { secrets: [] } } },
      ]);
      mockAwsSend.mockResolvedValue({ SecretString: JSON.stringify(AWS_EXISTING_SECRET) });

      const result = await service.sync("staging", "test-user", ["valet-api-stg"]);
      const flyResult = result.results.find((r) => r.target === "valet-api-stg");

      // Fly targets should be unavailable (no token → skip)
      if (flyResult) {
        expect(flyResult.success).toBe(false);
      }
    });

    it("handles Fly API POST error gracefully", async () => {
      setupFetchRouter([
        // Diff succeeds
        {
          pattern: "api.machines.dev",
          method: "GET",
          response: { ok: true, json: [{ label: "DATABASE_URL" }] },
        },
        // Sync POST fails
        {
          pattern: "api.machines.dev",
          method: "POST",
          response: { ok: false, status: 500, text: "Internal Server Error" },
        },
        // GH diff
        {
          pattern: "api.github.com",
          response: { ok: true, json: { secrets: [{ name: "SUPABASE_URL" }] } },
        },
      ]);
      mockAwsSend.mockResolvedValue({ SecretString: JSON.stringify(AWS_EXISTING_SECRET) });

      const result = await service.sync("staging", "test-user", ["valet-api-stg"]);
      const flyResult = result.results.find((r) => r.target === "valet-api-stg");

      expect(flyResult).toBeDefined();
      expect(flyResult!.success).toBe(false);
      expect(flyResult!.errors.length).toBeGreaterThan(0);
    });
  });

  describe("syncGhActions", () => {
    it("encrypts and pushes secrets to GitHub Actions", async () => {
      setupFetchRouter([
        // Fly diff
        {
          pattern: "api.machines.dev",
          method: "GET",
          response: { ok: true, json: [{ label: "DATABASE_URL" }] },
        },
        // GH diff: list secrets
        {
          pattern: /actions\/secrets$/,
          method: "GET",
          response: { ok: true, json: { secrets: [{ name: "SUPABASE_URL" }] } },
        },
        // GH sync: get public key
        {
          pattern: "public-key",
          method: "GET",
          response: { ok: true, json: { key: "base64publickey=", key_id: "key-123" } },
        },
        // GH sync: PUT individual secrets
        { pattern: /actions\/secrets\/[A-Z]/, method: "PUT", response: { ok: true, json: {} } },
      ]);
      mockAwsSend.mockResolvedValue({ SecretString: JSON.stringify(AWS_EXISTING_SECRET) });

      const result = await service.sync("staging", "test-user", ["WeKruit/GHOST-HANDS"]);
      const ghResult = result.results.find((r) => r.target === "WeKruit/GHOST-HANDS");

      expect(ghResult).toBeDefined();
      expect(ghResult!.success).toBe(true);
      expect(ghResult!.pushed).toBeGreaterThan(0);

      // Verify PUT calls with encrypted_value
      const putCalls = mockFetch.mock.calls.filter(
        (c) => (c[0] as string).includes("actions/secrets/") && c[1]?.method === "PUT",
      );
      expect(putCalls.length).toBeGreaterThan(0);

      for (const putCall of putCalls) {
        const body = JSON.parse(putCall[1].body);
        expect(body).toHaveProperty("encrypted_value");
        expect(body).toHaveProperty("key_id", "key-123");
      }
    });

    it("returns error when GITHUB_TOKEN is not set", async () => {
      delete process.env.GITHUB_TOKEN;

      setupFetchRouter([
        {
          pattern: "api.machines.dev",
          method: "GET",
          response: { ok: true, json: [{ label: "DATABASE_URL" }] },
        },
      ]);
      mockAwsSend.mockResolvedValue({ SecretString: JSON.stringify(AWS_EXISTING_SECRET) });

      const result = await service.sync("staging", "test-user", ["WeKruit/GHOST-HANDS"]);
      const ghResult = result.results.find((r) => r.target === "WeKruit/GHOST-HANDS");

      // Should be unavailable or errored
      if (ghResult) {
        expect(ghResult.success).toBe(false);
      }
    });
  });

  describe("syncAwsSm", () => {
    it("reads existing secret, merges canonical values, and writes back", async () => {
      const existingSecret = { DATABASE_URL: "postgres://old", EXTRA_KEY: "keep-me" };

      setupFetchRouter([
        {
          pattern: "api.machines.dev",
          method: "GET",
          response: { ok: true, json: [{ label: "DATABASE_URL" }] },
        },
        {
          pattern: "api.github.com",
          response: { ok: true, json: { secrets: [{ name: "SUPABASE_URL" }] } },
        },
      ]);

      // AWS: diff read → sync read → sync write
      mockAwsSend
        .mockResolvedValueOnce({ SecretString: JSON.stringify(existingSecret) }) // diff
        .mockResolvedValueOnce({ SecretString: JSON.stringify(existingSecret) }) // sync read
        .mockResolvedValueOnce({}); // sync write

      const result = await service.sync("staging", "test-user", ["ghosthands/staging"]);
      const awsResult = result.results.find((r) => r.target === "ghosthands/staging");

      expect(awsResult).toBeDefined();
      expect(awsResult!.success).toBe(true);
      expect(awsResult!.pushed).toBeGreaterThan(0);

      // Verify PutSecretValueCommand was called with merged data
      const putCalls = mockAwsSend.mock.calls.filter((c) => c[0]?._type === "Put");
      expect(putCalls.length).toBe(1);

      const merged = JSON.parse(putCalls[0]![0].input.SecretString);
      expect(merged.EXTRA_KEY).toBe("keep-me"); // preserved existing
      expect(merged.DATABASE_URL).toBe("postgres://staging"); // canonical wins
    });

    it("handles ResourceNotFoundException and creates new secret", async () => {
      const notFoundErr = new Error("ResourceNotFoundException: Secret not found");

      setupFetchRouter([
        {
          pattern: "api.machines.dev",
          method: "GET",
          response: { ok: true, json: [{ label: "DATABASE_URL" }] },
        },
        {
          pattern: "api.github.com",
          response: { ok: true, json: { secrets: [{ name: "SUPABASE_URL" }] } },
        },
      ]);

      // AWS: diff not found (still returns drifted) → sync read not found → sync write succeeds
      mockAwsSend
        .mockRejectedValueOnce(notFoundErr) // diff: returns drifted with error note
        .mockRejectedValueOnce(notFoundErr) // sync read: secret doesn't exist
        .mockResolvedValueOnce({}); // sync write: creates it

      const result = await service.sync("staging", "test-user", ["ghosthands/staging"]);
      const awsResult = result.results.find((r) => r.target === "ghosthands/staging");

      expect(awsResult).toBeDefined();
      expect(awsResult!.success).toBe(true);
      expect(awsResult!.pushed).toBeGreaterThan(0);
    });
  });

  describe("sync() status filtering", () => {
    it("skips targets with status 'error' without attempting push", async () => {
      // Force one Fly target to error during diff
      setupFetchRouter([
        {
          pattern: /valet-api-stg\/secrets/,
          method: "GET",
          error: new Error("Fly API unreachable"),
        },
        {
          pattern: "api.machines.dev",
          method: "GET",
          response: { ok: true, json: [{ label: "DATABASE_URL" }] },
        },
        {
          pattern: "api.github.com",
          response: { ok: true, json: { secrets: [{ name: "SUPABASE_URL" }] } },
        },
      ]);
      mockAwsSend.mockResolvedValue({ SecretString: JSON.stringify(AWS_EXISTING_SECRET) });

      const result = await service.sync("staging", "test-user", ["valet-api-stg"]);
      const errorResult = result.results.find((r) => r.target === "valet-api-stg");

      expect(errorResult).toBeDefined();
      expect(errorResult!.success).toBe(false);
      expect(errorResult!.pushed).toBe(0);
      expect(errorResult!.errors.length).toBeGreaterThan(0);

      // Verify NO POST to Fly for this target
      const postCalls = mockFetch.mock.calls.filter(
        (c) => (c[0] as string).includes("valet-api-stg") && c[1]?.method === "POST",
      );
      expect(postCalls.length).toBe(0);
    });

    it("skips targets with status 'unavailable'", async () => {
      delete process.env.FLY_API_TOKEN;

      setupFetchRouter([
        {
          pattern: "api.github.com",
          response: { ok: true, json: { secrets: [{ name: "SUPABASE_URL" }] } },
        },
      ]);
      mockAwsSend.mockResolvedValue({ SecretString: JSON.stringify(AWS_EXISTING_SECRET) });

      const result = await service.sync("staging", "test-user", ["valet-api-stg"]);
      const unavResult = result.results.find((r) => r.target === "valet-api-stg");

      if (unavResult) {
        expect(unavResult.success).toBe(false);
        expect(unavResult.pushed).toBe(0);
      }
    });
  });

  describe("audit logging", () => {
    it("writes audit entry after sync", async () => {
      setupFetchRouter([
        {
          pattern: "api.machines.dev",
          method: "GET",
          response: { ok: true, json: [{ label: "DATABASE_URL" }] },
        },
        { pattern: "api.machines.dev", method: "POST", response: { ok: true, json: {} } },
        {
          pattern: "api.github.com",
          response: { ok: true, json: { secrets: [{ name: "SUPABASE_URL" }] } },
        },
        { pattern: "public-key", response: { ok: true, json: { key: "pk=", key_id: "k1" } } },
        { pattern: /actions\/secrets\/[A-Z]/, method: "PUT", response: { ok: true, json: {} } },
      ]);
      mockAwsSend.mockResolvedValue({ SecretString: JSON.stringify(AWS_EXISTING_SECRET) });

      await service.sync("staging", "test-user");

      expect(mockDbInsert).toHaveBeenCalled();
      const insertCall = mockDbValues.mock.calls[0]![0];
      expect(insertCall.action).toBe("secrets_sync");
      expect(insertCall.userId).toBe("test-user");
      expect(insertCall.details.environment).toBe("staging");
    });
  });
});
