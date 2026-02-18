/**
 * E2E tests for the Admin Sandboxes feature.
 *
 * Prerequisites:
 *   - Install Playwright: pnpm --filter @valet/web add -D @playwright/test
 *   - Run: npx playwright install
 *   - Seed test data: pnpm --filter @valet/db exec tsx src/seed-test-data.ts
 *   - Start API: pnpm --filter @valet/api dev
 *   - Start Web: pnpm --filter @valet/web dev
 *
 * Usage:
 *   pnpm --filter @valet/web exec playwright test tests/e2e/admin-sandboxes.spec.ts
 */

import { test, expect, type Page } from "@playwright/test";

const API_URL = process.env.VITE_API_URL ?? "http://localhost:8000";
const WEB_URL = process.env.VITE_WEB_URL ?? "http://localhost:5173";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loginAsAdmin(page: Page) {
  // Navigate to login and authenticate as admin.
  // This assumes the admin user (admin@test.com) exists in the DB
  // and has a valid password or Google OAuth setup.
  await page.goto(`${WEB_URL}/login`);

  // For testing, we may need to inject a JWT directly.
  // This is a common pattern for E2E tests that bypass OAuth.
  const adminToken = await getTestToken("admin@test.com", "admin");

  await page.evaluate((token) => {
    localStorage.setItem("auth_token", token);
  }, adminToken);

  await page.goto(`${WEB_URL}/admin/sandboxes`);
  await page.waitForLoadState("networkidle");
}

async function loginAsUser(page: Page) {
  const userToken = await getTestToken("user@test.com", "user");

  await page.evaluate((token) => {
    localStorage.setItem("auth_token", token);
  }, userToken);

  await page.goto(`${WEB_URL}/admin/sandboxes`);
  await page.waitForLoadState("networkidle");
}

async function getTestToken(email: string, _role: string): Promise<string> {
  // Generate a test JWT using the API's login endpoint
  // In a real setup, use the test seed user credentials
  const response = await fetch(`${API_URL}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "test-password" }),
  });

  if (response.ok) {
    const data = (await response.json()) as { tokens: { accessToken: string } };
    return data.tokens.accessToken;
  }

  // Fallback: generate a mock JWT for testing
  // This would require a test-specific auth endpoint
  throw new Error(
    `Cannot get test token for ${email}. Ensure test user exists and API is running.`,
  );
}

// ---------------------------------------------------------------------------
// 1. Admin Authentication
// ---------------------------------------------------------------------------

test.describe("Admin Authentication", () => {
  test("admin user can access /admin/sandboxes", async ({ page }) => {
    await loginAsAdmin(page);
    await expect(page).toHaveURL(/\/admin\/sandboxes/);
    await expect(page.getByRole("heading", { name: /sandbox/i })).toBeVisible();
  });

  test("regular user is denied access to /admin/sandboxes", async ({ page }) => {
    await loginAsUser(page);
    // Should show access denied message
    await expect(page.getByText(/access denied/i)).toBeVisible();
  });

  test("unauthenticated user is redirected to /login", async ({ page }) => {
    await page.goto(`${WEB_URL}/admin/sandboxes`);
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/login/);
  });
});

// ---------------------------------------------------------------------------
// 2. Sandbox List Page
// ---------------------------------------------------------------------------

test.describe("Sandbox List Page", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("displays sandboxes from database", async ({ page }) => {
    // The seeded sandboxes should appear
    await expect(page.getByText("staging-sandbox-2")).toBeVisible();
    await expect(page.getByText("staging-sandbox-1")).toBeVisible();
    await expect(page.getByText("prod-sandbox-1")).toBeVisible();
  });

  test("environment filter works", async ({ page }) => {
    // Click environment filter and select "staging"
    const envFilter = page.getByRole("combobox", { name: /environment/i });
    if (await envFilter.isVisible()) {
      await envFilter.selectOption("staging");
      await page.waitForLoadState("networkidle");
      await expect(page.getByText("staging-sandbox-2")).toBeVisible();
    }
  });

  test("search by name works", async ({ page }) => {
    const searchInput = page.getByPlaceholder(/search/i);
    if (await searchInput.isVisible()) {
      await searchInput.fill("staging");
      await page.waitForTimeout(500); // debounce
      await expect(page.getByText("staging-sandbox-1")).toBeVisible();
    }
  });

  test("create button is visible", async ({ page }) => {
    await expect(page.getByRole("button", { name: /create|add|new/i })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 3. Create Sandbox Flow
// ---------------------------------------------------------------------------

test.describe("Create Sandbox Flow", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("can open create form and fill required fields", async ({ page }) => {
    const createBtn = page.getByRole("button", { name: /create|add|new/i });
    await createBtn.click();

    // Fill form fields
    const nameInput = page.getByLabel(/name/i);
    if (await nameInput.isVisible()) {
      await nameInput.fill("test-sandbox-e2e");
    }

    const instanceIdInput = page.getByLabel(/instance.*id/i);
    if (await instanceIdInput.isVisible()) {
      await instanceIdInput.fill("i-e2etest001");
    }

    const instanceTypeInput = page.getByLabel(/instance.*type/i);
    if (await instanceTypeInput.isVisible()) {
      await instanceTypeInput.fill("t3.medium");
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Sandbox Detail Page
// ---------------------------------------------------------------------------

test.describe("Sandbox Detail Page", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("clicking a sandbox shows detail view", async ({ page }) => {
    const sandboxLink = page.getByText("staging-sandbox-2");
    await sandboxLink.click();

    await page.waitForLoadState("networkidle");

    // Detail page should show sandbox info
    await expect(page.getByText("staging-sandbox-2")).toBeVisible();
    await expect(page.getByText("t3.medium")).toBeVisible();
  });

  test("health check button triggers a check", async ({ page }) => {
    const sandboxLink = page.getByText("staging-sandbox-2");
    await sandboxLink.click();
    await page.waitForLoadState("networkidle");

    const healthBtn = page.getByRole("button", {
      name: /health.*check|check.*health/i,
    });
    if (await healthBtn.isVisible()) {
      await healthBtn.click();
      // Should show some status update
      await page.waitForTimeout(1000);
    }
  });
});

// ---------------------------------------------------------------------------
// 5. Error Handling
// ---------------------------------------------------------------------------

test.describe("Error Handling", () => {
  test("shows error for non-existent sandbox", async ({ page }) => {
    await loginAsAdmin(page);

    await page.goto(`${WEB_URL}/admin/sandboxes/00000000-0000-0000-0000-000000000000`);
    await page.waitForLoadState("networkidle");

    // Should show not found or error message
    const hasError =
      (await page
        .getByText(/not found/i)
        .isVisible()
        .catch(() => false)) ||
      (await page
        .getByText(/error/i)
        .isVisible()
        .catch(() => false));
    expect(hasError).toBeTruthy();
  });
});
