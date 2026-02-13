import { type Page, type BrowserContext } from "@playwright/test";
import { sign } from "jsonwebtoken";
import { randomUUID } from "node:crypto";

/**
 * JWT secret used in test environment.
 * Must match the JWT_SECRET configured when running the API in test mode.
 */
const TEST_JWT_SECRET = "test-jwt-secret-do-not-use-in-production";

export interface TestUser {
  id: string;
  email: string;
  name: string;
}

/**
 * Create a test user with optional overrides.
 */
export function createTestUser(overrides?: Partial<TestUser>): TestUser {
  return {
    id: randomUUID(),
    email: "alice@example.com",
    name: "Alice Johnson",
    ...overrides,
  };
}

/**
 * Generate a signed JWT token for a test user.
 */
export function generateToken(user: TestUser): string {
  return sign(
    {
      sub: user.id,
      email: user.email,
      name: user.name,
    },
    TEST_JWT_SECRET,
    { algorithm: "HS256", expiresIn: "1h" },
  );
}

/**
 * Set up an authenticated session by injecting a JWT cookie.
 * Call this before navigating to any authenticated page.
 *
 * Usage:
 *   const user = createTestUser();
 *   await authenticate(page.context(), user);
 *   await page.goto("/dashboard");
 */
export async function authenticate(
  context: BrowserContext,
  user?: TestUser,
): Promise<TestUser> {
  const testUser = user ?? createTestUser();
  const token = generateToken(testUser);

  await context.addCookies([
    {
      name: "valet_token",
      value: token,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    },
  ]);

  return testUser;
}

/**
 * Clear authentication by removing the JWT cookie.
 * Simulates logging out at the cookie level.
 */
export async function clearAuth(context: BrowserContext): Promise<void> {
  await context.clearCookies();
}

/**
 * Mock the Google OAuth redirect by intercepting the OAuth endpoint
 * and returning a pre-signed JWT directly.
 *
 * Usage:
 *   const user = await mockGoogleOAuth(page);
 *   // Now clicking "Sign in with Google" will complete instantly
 */
export async function mockGoogleOAuth(
  page: Page,
  user?: TestUser,
): Promise<TestUser> {
  const testUser = user ?? createTestUser();
  const token = generateToken(testUser);

  // Intercept the Google OAuth callback and simulate a successful login
  await page.route("**/api/v1/auth/google/callback**", async (route) => {
    await route.fulfill({
      status: 302,
      headers: {
        Location: "/dashboard",
        "Set-Cookie": `valet_token=${token}; Path=/; HttpOnly; SameSite=Lax`,
      },
    });
  });

  // Intercept the initial Google OAuth redirect to skip the Google consent screen
  await page.route("**/api/v1/auth/google**", async (route) => {
    await route.fulfill({
      status: 302,
      headers: {
        Location: `/api/v1/auth/google/callback?code=mock-auth-code&state=mock-state`,
      },
    });
  });

  return testUser;
}

/**
 * Mock the /api/v1/auth/me endpoint to return the given user.
 * Useful for tests that need the frontend to recognize the user as logged in.
 */
export async function mockAuthMe(page: Page, user: TestUser): Promise<void> {
  await page.route("**/api/v1/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: null,
        onboardingComplete: true,
      }),
    });
  });
}
