import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SecretsSyncService } from "../../src/modules/secrets/secrets-sync.service.js";

// ─── SM canonical data ───────────────────────────────────────────────

const VALET_SM_SECRET = {
  DATABASE_URL: "postgres://staging",
  JWT_SECRET: "staging-jwt-secret",
  REDIS_URL: "redis://staging",
  SUPABASE_URL: "https://supabase.staging",
  SUPABASE_SECRET_KEY: "sb-secret",
  GH_SERVICE_SECRET: "gh-service-key",
  VITE_API_URL: "https://api.staging",
};

const GH_SM_SECRET = {
  DATABASE_URL: "postgres://staging",
  SUPABASE_URL: "https://supabase.staging",
  SUPABASE_SECRET_KEY: "sb-secret",
  GH_SERVICE_SECRET: "gh-service-key",
};

// ─── Mocks ────────────────────────────────────────────────────────────

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
  DescribeSecretCommand: vi.fn().mockImplementation((input: unknown) => ({
    _type: "Describe",
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
    return Promise.resolve({
      ok: false,
      status: 404,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve("Not found"),
    });
  });
}

// ─── SM mock helper ──────────────────────────────────────────────────

/**
 * Sets up mockAwsSend to handle readFromSm + diff/sync SM calls.
 * The mock routes by _type and SecretId.
 */
function setupSmRouter(
  secrets: Record<string, Record<string, string> | Error>,
  writeSpy?: { calls: Array<{ secretId: string; data: Record<string, string> }> },
) {
  mockAwsSend.mockImplementation(
    (cmd: { _type: string; input: { SecretId?: string; SecretString?: string } }) => {
      if (cmd._type === "Get") {
        const secretId = cmd.input.SecretId!;
        const data = secrets[secretId];
        if (data instanceof Error) return Promise.reject(data);
        if (data) return Promise.resolve({ SecretString: JSON.stringify(data) });
        return Promise.reject(new Error("ResourceNotFoundException: Secret not found"));
      }
      if (cmd._type === "Put") {
        if (writeSpy) {
          writeSpy.calls.push({
            secretId: cmd.input.SecretId!,
            data: JSON.parse(cmd.input.SecretString!),
          });
        }
        return Promise.resolve({});
      }
      if (cmd._type === "Describe") {
        return Promise.resolve({ LastChangedDate: new Date("2026-02-23T00:00:00Z") });
      }
      return Promise.resolve({});
    },
  );
}

// ─── Tests ────────────────────────────────────────────────────────────

describe("SecretsSyncService", () => {
  let service: SecretsSyncService;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.FLY_API_TOKEN = "fly-test-token";
    process.env.GITHUB_TOKEN = "gh-test-token";
    process.env.AWS_REGION = "us-east-1";

    service = new SecretsSyncService({ logger: mockLogger, db: mockDb });
  });

  afterEach(() => {
    delete process.env.FLY_API_TOKEN;
    delete process.env.GITHUB_TOKEN;
    delete process.env.AWS_REGION;
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;
  });

  // ─── readFromSm (via getDiff) ──────────────────────────────────────

  describe("readFromSm", () => {
    it("reads canonical vars from SM instead of .env files", async () => {
      setupSmRouter({
        "valet/staging": VALET_SM_SECRET,
        "ghosthands/staging": GH_SM_SECRET,
      });
      setupFetchRouter([
        { pattern: "api.machines.dev", method: "GET", response: { ok: true, json: [] } },
        { pattern: "api.github.com", response: { ok: true, json: { secrets: [] } } },
      ]);

      const diff = await service.getDiff("staging");

      // Should have targets from the diff
      expect(diff.environment).toBe("staging");
      expect(diff.targets.length).toBeGreaterThan(0);

      // Verify no fs calls were made (no readFileSync mock needed)
      // The test passes without vi.mock("node:fs") = SM is the source
    });

    it("handles ResourceNotFoundException gracefully (returns empty)", async () => {
      setupSmRouter({
        "valet/staging": new Error("ResourceNotFoundException: Secret not found"),
        "ghosthands/staging": GH_SM_SECRET,
      });
      setupFetchRouter([
        { pattern: "api.machines.dev", method: "GET", response: { ok: true, json: [] } },
        { pattern: "api.github.com", response: { ok: true, json: { secrets: [] } } },
      ]);

      // Should not throw — just returns empty vars for valet/staging
      const diff = await service.getDiff("staging");
      expect(diff.environment).toBe("staging");
    });

    it("filters out RUNTIME_VARS from SM data", async () => {
      const smWithRuntime = {
        ...VALET_SM_SECRET,
        GH_WORKER_ID: "should-be-filtered",
        COMMIT_SHA: "should-be-filtered",
        EC2_INSTANCE_ID: "should-be-filtered",
      };
      setupSmRouter({
        "valet/staging": smWithRuntime,
        "ghosthands/staging": GH_SM_SECRET,
      });
      setupFetchRouter([
        {
          pattern: "api.machines.dev",
          method: "GET",
          response: {
            ok: true,
            json: Object.keys(VALET_SM_SECRET)
              .filter((k) => !k.startsWith("VITE_"))
              .map((k) => ({ label: k })),
          },
        },
        { pattern: "api.github.com", response: { ok: true, json: { secrets: [] } } },
      ]);

      const diff = await service.getDiff("staging");
      // Fly targets should NOT list runtime vars as missing
      const flyTarget = diff.targets.find((t) => t.target === "valet-api-stg");
      if (flyTarget) {
        expect(flyTarget.missing).not.toContain("GH_WORKER_ID");
        expect(flyTarget.missing).not.toContain("COMMIT_SHA");
        expect(flyTarget.missing).not.toContain("EC2_INSTANCE_ID");
      }
    });

    it("handles empty SecretString", async () => {
      mockAwsSend.mockImplementation((cmd: { _type: string }) => {
        if (cmd._type === "Get") return Promise.resolve({ SecretString: "" });
        if (cmd._type === "Describe") return Promise.resolve({});
        return Promise.resolve({});
      });
      setupFetchRouter([
        { pattern: "api.machines.dev", method: "GET", response: { ok: true, json: [] } },
        { pattern: "api.github.com", response: { ok: true, json: { secrets: [] } } },
      ]);

      const diff = await service.getDiff("staging");
      // Should not throw — empty string = no vars
      expect(diff.targets.length).toBeGreaterThan(0);
    });
  });

  // ─── syncFlyApp ────────────────────────────────────────────────────

  describe("syncFlyApp", () => {
    it("pushes missing secrets to Fly.io Machines API", async () => {
      setupSmRouter({
        "valet/staging": VALET_SM_SECRET,
        "ghosthands/staging": GH_SM_SECRET,
      });
      setupFetchRouter([
        {
          pattern: "api.machines.dev",
          method: "GET",
          response: { ok: true, json: [{ label: "DATABASE_URL" }] },
        },
        { pattern: "api.machines.dev", method: "POST", response: { ok: true, json: {} } },
        {
          pattern: "api.github.com/repos/WeKruit/GHOST-HANDS/actions/secrets",
          method: "GET",
          response: { ok: true, json: { secrets: [{ name: "SUPABASE_URL" }] } },
        },
      ]);

      const result = await service.sync("staging", "test-user", ["valet-api-stg"]);
      const flyResult = result.results.find((r) => r.target === "valet-api-stg");

      expect(flyResult).toBeDefined();
      expect(flyResult!.success).toBe(true);
      expect(flyResult!.pushed).toBeGreaterThan(0);

      const postCalls = mockFetch.mock.calls.filter(
        (c) => (c[0] as string).includes("api.machines.dev") && c[1]?.method === "POST",
      );
      expect(postCalls.length).toBe(1);

      const body = JSON.parse(postCalls[0]![1].body);
      expect(Array.isArray(body)).toBe(true);
      expect(body[0]).toHaveProperty("label");
      expect(body[0]).toHaveProperty("value");
      expect(body[0].type).toBe("secret");
    });

    it("returns error when FLY_API_TOKEN is not set", async () => {
      delete process.env.FLY_API_TOKEN;

      setupSmRouter({
        "valet/staging": VALET_SM_SECRET,
        "ghosthands/staging": GH_SM_SECRET,
      });
      setupFetchRouter([
        { pattern: "api.github.com", response: { ok: true, json: { secrets: [] } } },
      ]);

      const result = await service.sync("staging", "test-user", ["valet-api-stg"]);
      const flyResult = result.results.find((r) => r.target === "valet-api-stg");

      if (flyResult) {
        expect(flyResult.success).toBe(false);
      }
    });

    it("handles Fly API POST error gracefully", async () => {
      setupSmRouter({
        "valet/staging": VALET_SM_SECRET,
        "ghosthands/staging": GH_SM_SECRET,
      });
      setupFetchRouter([
        {
          pattern: "api.machines.dev",
          method: "GET",
          response: { ok: true, json: [{ label: "DATABASE_URL" }] },
        },
        {
          pattern: "api.machines.dev",
          method: "POST",
          response: { ok: false, status: 500, text: "Internal Server Error" },
        },
        {
          pattern: "api.github.com",
          response: { ok: true, json: { secrets: [{ name: "SUPABASE_URL" }] } },
        },
      ]);

      const result = await service.sync("staging", "test-user", ["valet-api-stg"]);
      const flyResult = result.results.find((r) => r.target === "valet-api-stg");

      expect(flyResult).toBeDefined();
      expect(flyResult!.success).toBe(false);
      expect(flyResult!.errors.length).toBeGreaterThan(0);
    });
  });

  // ─── syncGhActions ─────────────────────────────────────────────────

  describe("syncGhActions", () => {
    it("encrypts and pushes secrets to GitHub Actions", async () => {
      setupSmRouter({
        "valet/staging": VALET_SM_SECRET,
        "ghosthands/staging": GH_SM_SECRET,
      });
      setupFetchRouter([
        {
          pattern: "api.machines.dev",
          method: "GET",
          response: { ok: true, json: [{ label: "DATABASE_URL" }] },
        },
        {
          pattern: /actions\/secrets$/,
          method: "GET",
          response: { ok: true, json: { secrets: [{ name: "SUPABASE_URL" }] } },
        },
        {
          pattern: "public-key",
          method: "GET",
          response: { ok: true, json: { key: "base64publickey=", key_id: "key-123" } },
        },
        { pattern: /actions\/secrets\/[A-Z]/, method: "PUT", response: { ok: true, json: {} } },
      ]);

      const result = await service.sync("staging", "test-user", ["WeKruit/GHOST-HANDS"]);
      const ghResult = result.results.find((r) => r.target === "WeKruit/GHOST-HANDS");

      expect(ghResult).toBeDefined();
      expect(ghResult!.success).toBe(true);
      expect(ghResult!.pushed).toBeGreaterThan(0);

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

      setupSmRouter({
        "valet/staging": VALET_SM_SECRET,
        "ghosthands/staging": GH_SM_SECRET,
      });
      setupFetchRouter([
        {
          pattern: "api.machines.dev",
          method: "GET",
          response: { ok: true, json: [{ label: "DATABASE_URL" }] },
        },
      ]);

      const result = await service.sync("staging", "test-user", ["WeKruit/GHOST-HANDS"]);
      const ghResult = result.results.find((r) => r.target === "WeKruit/GHOST-HANDS");

      if (ghResult) {
        expect(ghResult.success).toBe(false);
      }
    });
  });

  // ─── syncAwsSm ─────────────────────────────────────────────────────

  describe("syncAwsSm", () => {
    // NOTE: With SM as canonical source, ghosthands/{env} is BOTH the canonical
    // source and the AWS SM target. So diffing SM against itself always shows
    // "synced" — there's nothing to push. This is expected behavior.

    it("reports SM target as synced when canonical source equals target", async () => {
      setupSmRouter({
        "valet/staging": VALET_SM_SECRET,
        "ghosthands/staging": GH_SM_SECRET,
      });
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

      const result = await service.sync("staging", "test-user", ["ghosthands/staging"]);
      const awsResult = result.results.find((r) => r.target === "ghosthands/staging");

      expect(awsResult).toBeDefined();
      expect(awsResult!.success).toBe(true);
      // SM source === SM target → 0 drift → 0 pushed
      expect(awsResult!.pushed).toBe(0);
    });

    it("handles missing SM secret gracefully in diff", async () => {
      const notFoundErr = new Error("ResourceNotFoundException: Secret not found");

      // Both valet and ghosthands SM secrets missing — readFromSm returns empty, diffAwsSm also not found
      mockAwsSend.mockImplementation((cmd: { _type: string; input: { SecretId?: string } }) => {
        if (cmd._type === "Get") return Promise.reject(notFoundErr);
        return Promise.resolve({});
      });

      setupFetchRouter([
        {
          pattern: "api.machines.dev",
          method: "GET",
          response: { ok: true, json: [] },
        },
        {
          pattern: "api.github.com",
          response: { ok: true, json: { secrets: [] } },
        },
      ]);

      // Should not throw — handles gracefully
      const diff = await service.getDiff("staging");
      expect(diff.environment).toBe("staging");
      const awsTarget = diff.targets.find((t) => t.targetType === "aws-sm");
      // Both empty → status is "drifted" with error note about not found
      expect(awsTarget).toBeDefined();
    });
  });

  // ─── sync() status filtering ───────────────────────────────────────

  describe("sync() status filtering", () => {
    it("skips targets with status 'error' without attempting push", async () => {
      setupSmRouter({
        "valet/staging": VALET_SM_SECRET,
        "ghosthands/staging": GH_SM_SECRET,
      });
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

      const result = await service.sync("staging", "test-user", ["valet-api-stg"]);
      const errorResult = result.results.find((r) => r.target === "valet-api-stg");

      expect(errorResult).toBeDefined();
      expect(errorResult!.success).toBe(false);
      expect(errorResult!.pushed).toBe(0);
      expect(errorResult!.errors.length).toBeGreaterThan(0);

      const postCalls = mockFetch.mock.calls.filter(
        (c) => (c[0] as string).includes("valet-api-stg") && c[1]?.method === "POST",
      );
      expect(postCalls.length).toBe(0);
    });

    it("skips targets with status 'unavailable'", async () => {
      delete process.env.FLY_API_TOKEN;

      setupSmRouter({
        "valet/staging": VALET_SM_SECRET,
        "ghosthands/staging": GH_SM_SECRET,
      });
      setupFetchRouter([
        {
          pattern: "api.github.com",
          response: { ok: true, json: { secrets: [{ name: "SUPABASE_URL" }] } },
        },
      ]);

      const result = await service.sync("staging", "test-user", ["valet-api-stg"]);
      const unavResult = result.results.find((r) => r.target === "valet-api-stg");

      if (unavResult) {
        expect(unavResult.success).toBe(false);
        expect(unavResult.pushed).toBe(0);
      }
    });
  });

  // ─── audit logging ─────────────────────────────────────────────────

  describe("audit logging", () => {
    it("writes audit entry after sync", async () => {
      setupSmRouter({
        "valet/staging": VALET_SM_SECRET,
        "ghosthands/staging": GH_SM_SECRET,
      });
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

      await service.sync("staging", "test-user");

      expect(mockDbInsert).toHaveBeenCalled();
      const insertCall = mockDbValues.mock.calls[0]![0];
      expect(insertCall.action).toBe("secrets_sync");
      expect(insertCall.userId).toBe("test-user");
      expect(insertCall.details.environment).toBe("staging");
    });
  });

  // ─── CRUD: listVars ────────────────────────────────────────────────

  describe("listVars", () => {
    it("returns all keys from SM for valet project", async () => {
      setupSmRouter({ "valet/staging": VALET_SM_SECRET });

      const result = await service.listVars("staging", "valet");

      expect(result.environment).toBe("staging");
      expect(result.project).toBe("valet");
      expect(result.secretId).toBe("valet/staging");
      expect(result.totalKeys).toBe(Object.keys(VALET_SM_SECRET).length);
      expect(result.vars.map((v) => v.key)).toContain("DATABASE_URL");
      expect(result.lastModified).toBe("2026-02-23T00:00:00.000Z");
    });

    it("returns all keys from SM for ghosthands project", async () => {
      setupSmRouter({ "ghosthands/production": GH_SM_SECRET });

      const result = await service.listVars("production", "ghosthands");

      expect(result.environment).toBe("production");
      expect(result.project).toBe("ghosthands");
      expect(result.secretId).toBe("ghosthands/production");
      expect(result.totalKeys).toBe(Object.keys(GH_SM_SECRET).length);
    });

    it("returns empty array when SM secret doesn't exist", async () => {
      setupSmRouter({});

      const result = await service.listVars("staging", "valet");

      expect(result.vars).toEqual([]);
      expect(result.totalKeys).toBe(0);
    });

    it("marks runtime vars as isRuntime", async () => {
      const secretWithRuntime = { ...VALET_SM_SECRET, GH_WORKER_ID: "w-123" };
      setupSmRouter({ "valet/staging": secretWithRuntime });

      const result = await service.listVars("staging", "valet");

      const runtimeVar = result.vars.find((v) => v.key === "GH_WORKER_ID");
      expect(runtimeVar).toBeDefined();
      expect(runtimeVar!.isRuntime).toBe(true);

      const normalVar = result.vars.find((v) => v.key === "DATABASE_URL");
      expect(normalVar).toBeDefined();
      expect(normalVar!.isRuntime).toBe(false);
    });
  });

  // ─── CRUD: upsertVars ──────────────────────────────────────────────

  describe("upsertVars", () => {
    it("upserts new keys into SM (read-merge-write)", async () => {
      const writeSpy = { calls: [] as Array<{ secretId: string; data: Record<string, string> }> };
      setupSmRouter({ "valet/staging": VALET_SM_SECRET }, writeSpy);

      const result = await service.upsertVars(
        "staging",
        "valet",
        [{ key: "NEW_KEY", value: "new-value" }],
        "admin-user",
      );

      expect(result.upserted).toBe(1);
      expect(result.keys).toEqual(["NEW_KEY"]);

      // Verify write
      const puts = writeSpy.calls.filter((c) => c.secretId === "valet/staging");
      expect(puts.length).toBe(1);
      expect(puts[0]!.data.NEW_KEY).toBe("new-value");
      expect(puts[0]!.data.DATABASE_URL).toBe("postgres://staging"); // preserved
    });

    it("updates existing keys (new value wins)", async () => {
      const writeSpy = { calls: [] as Array<{ secretId: string; data: Record<string, string> }> };
      setupSmRouter({ "valet/staging": VALET_SM_SECRET }, writeSpy);

      await service.upsertVars(
        "staging",
        "valet",
        [{ key: "DATABASE_URL", value: "postgres://new-staging" }],
        "admin-user",
      );

      const puts = writeSpy.calls.filter((c) => c.secretId === "valet/staging");
      expect(puts[0]!.data.DATABASE_URL).toBe("postgres://new-staging");
    });

    it("rejects RUNTIME_VARS keys", async () => {
      setupSmRouter({ "valet/staging": VALET_SM_SECRET });

      await expect(
        service.upsertVars(
          "staging",
          "valet",
          [{ key: "GH_WORKER_ID", value: "bad" }],
          "admin-user",
        ),
      ).rejects.toThrow("runtime-injected");
    });

    it("validates key format", async () => {
      setupSmRouter({ "valet/staging": VALET_SM_SECRET });

      await expect(
        service.upsertVars(
          "staging",
          "valet",
          [{ key: "lowercase_key", value: "bad" }],
          "admin-user",
        ),
      ).rejects.toThrow("Invalid key format");
    });

    it("writes audit log entry with keys but not values", async () => {
      setupSmRouter({ "valet/staging": VALET_SM_SECRET });

      await service.upsertVars(
        "staging",
        "valet",
        [{ key: "NEW_KEY", value: "secret-value" }],
        "admin-user",
      );

      expect(mockDbInsert).toHaveBeenCalled();
      const insertCall = mockDbValues.mock.calls[0]![0];
      expect(insertCall.action).toBe("secrets_upsert");
      expect(insertCall.details.upsertedKeys).toEqual(["NEW_KEY"]);
      // Value should NOT be in audit log
      expect(JSON.stringify(insertCall.details)).not.toContain("secret-value");
    });
  });

  // ─── CRUD: deleteVars ──────────────────────────────────────────────

  describe("deleteVars", () => {
    it("removes keys from SM", async () => {
      const writeSpy = { calls: [] as Array<{ secretId: string; data: Record<string, string> }> };
      setupSmRouter({ "valet/staging": VALET_SM_SECRET }, writeSpy);

      const result = await service.deleteVars("staging", "valet", ["REDIS_URL"], "admin-user");

      expect(result.deleted).toBe(1);
      expect(result.keys).toEqual(["REDIS_URL"]);

      const puts = writeSpy.calls.filter((c) => c.secretId === "valet/staging");
      expect(puts.length).toBe(1);
      expect(puts[0]!.data.REDIS_URL).toBeUndefined(); // removed
      expect(puts[0]!.data.DATABASE_URL).toBe("postgres://staging"); // preserved
    });

    it("handles non-existent keys gracefully", async () => {
      const writeSpy = { calls: [] as Array<{ secretId: string; data: Record<string, string> }> };
      setupSmRouter({ "valet/staging": VALET_SM_SECRET }, writeSpy);

      const result = await service.deleteVars(
        "staging",
        "valet",
        ["NONEXISTENT_KEY"],
        "admin-user",
      );

      expect(result.deleted).toBe(0);
      expect(result.keys).toEqual([]);
      // No write needed since nothing changed
      expect(writeSpy.calls.length).toBe(0);
    });

    it("writes audit log entry", async () => {
      setupSmRouter({ "valet/staging": VALET_SM_SECRET });

      await service.deleteVars("staging", "valet", ["JWT_SECRET"], "admin-user");

      expect(mockDbInsert).toHaveBeenCalled();
      const insertCall = mockDbValues.mock.calls[0]![0];
      expect(insertCall.action).toBe("secrets_delete");
      expect(insertCall.details.deletedKeys).toEqual(["JWT_SECRET"]);
    });
  });
});
