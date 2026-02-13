import { test, expect } from "@playwright/test";
import {
  authenticate,
  clearAuth,
  createTestUser,
  mockGoogleOAuth,
  mockAuthMe,
} from "./helpers/auth";

test.describe("Authentication", () => {
  test("redirects unauthenticated users to /login", async ({ page }) => {
    await page.goto("/dashboard");
    // TODO: Enable once auth guard middleware is wired up in the router.
    // The current router doesn't enforce auth redirects yet.
    await expect(page).toHaveURL(/\/login/);
  });

  test("login page renders with Google OAuth button", async ({ page }) => {
    await page.goto("/login");

    // Page title / branding
    await expect(page.getByText("WeKruit Valet")).toBeVisible();
    await expect(page.getByText("Welcome back")).toBeVisible();

    // Google sign-in button
    const googleButton = page.getByRole("button", {
      name: /sign in with google/i,
    });
    await expect(googleButton).toBeVisible();
    await expect(googleButton).toBeEnabled();
  });

  test("login page shows trust signals", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByText("AES-256 encrypted")).toBeVisible();
    await expect(page.getByText("GDPR ready")).toBeVisible();
  });

  test("Google OAuth login redirects to onboarding for new users", async ({
    page,
  }) => {
    await page.goto("/login");

    // Click "Sign in with Google" - currently navigates directly to /onboarding
    await page.getByRole("button", { name: /sign in with google/i }).click();
    await expect(page).toHaveURL(/\/onboarding/);
  });

  test("authenticated user can access /dashboard", async ({ page }) => {
    const user = createTestUser();
    await authenticate(page.context(), user);
    await mockAuthMe(page, user);

    await page.goto("/dashboard");

    // Should stay on dashboard, not be redirected to login
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("logout clears session and redirects to /login", async ({ page }) => {
    const user = createTestUser();
    await authenticate(page.context(), user);
    await mockAuthMe(page, user);

    await page.goto("/dashboard");

    // TODO: Click the actual logout button once the header dropdown is implemented.
    // For now, simulate logout by clearing cookies and navigating.
    await clearAuth(page.context());
    await page.goto("/dashboard");

    // Should redirect to login
    await expect(page).toHaveURL(/\/login/);
  });
});
