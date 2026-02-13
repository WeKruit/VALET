import type { FastifyInstance } from "fastify";
import { sign } from "jsonwebtoken";
import { UserFactory, type User } from "../../../../tests/fixtures";

/**
 * JWT secret used in test environment.
 * Must match the secret configured in the test Fastify app.
 */
const TEST_JWT_SECRET = "test-jwt-secret-do-not-use-in-production";

/**
 * Create a signed JWT for a test user.
 */
export function createTestToken(user: Partial<User> = {}): string {
  const testUser = UserFactory.create(user);
  return sign(
    {
      sub: testUser.id,
      email: testUser.email,
      name: testUser.name,
    },
    TEST_JWT_SECRET,
    { algorithm: "HS256", expiresIn: "1h" },
  );
}

/**
 * Create an expired JWT for testing auth rejection.
 */
export function createExpiredToken(user: Partial<User> = {}): string {
  const testUser = UserFactory.create(user);
  return sign(
    {
      sub: testUser.id,
      email: testUser.email,
      name: testUser.name,
    },
    TEST_JWT_SECRET,
    { algorithm: "HS256", expiresIn: "-1h" },
  );
}

/**
 * Authenticated test client that wraps Fastify's inject method.
 * Automatically attaches JWT auth headers to requests.
 */
export function createTestClient(app: FastifyInstance, user?: Partial<User>) {
  const token = createTestToken(user);

  async function request(
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    url: string,
    options: { body?: unknown; headers?: Record<string, string> } = {},
  ) {
    const response = await app.inject({
      method,
      url,
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        ...options.headers,
      },
      payload: options.body ? JSON.stringify(options.body) : undefined,
    });

    return {
      status: response.statusCode,
      body: response.json(),
      headers: response.headers,
      raw: response,
    };
  }

  return {
    get: (url: string, headers?: Record<string, string>) =>
      request("GET", url, { headers }),
    post: (url: string, body?: unknown, headers?: Record<string, string>) =>
      request("POST", url, { body, headers }),
    put: (url: string, body?: unknown, headers?: Record<string, string>) =>
      request("PUT", url, { body, headers }),
    patch: (url: string, body?: unknown, headers?: Record<string, string>) =>
      request("PATCH", url, { body, headers }),
    delete: (url: string, headers?: Record<string, string>) =>
      request("DELETE", url, { headers }),
    token,
  };
}
