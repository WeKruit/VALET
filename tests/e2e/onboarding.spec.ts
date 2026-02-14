import { test, expect } from "@playwright/test";
import { authenticate, createTestUser, mockAuthMe } from "./helpers/auth";
import path from "node:path";

const RESUME_FIXTURE = path.resolve(__dirname, "../fixtures/test-resume.pdf");

/** Shared mock for the resume upload endpoint (returns status 202). */
function mockResumeUpload(page: import("@playwright/test").Page) {
  return page.route("**/api/v1/resumes", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({
          id: "00000000-0000-0000-0000-000000000001",
          filename: "test-resume.pdf",
        }),
      });
    } else {
      await route.continue();
    }
  });
}

/** Shared mock for the user profile endpoint used in the review step. */
function mockUserProfile(page: import("@playwright/test").Page) {
  return page.route("**/api/v1/users/profile", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "00000000-0000-0000-0000-000000000010",
        name: "Alice Johnson",
        email: "alice@example.com",
        phone: "(555) 123-4567",
        location: "San Francisco, CA",
        skills: ["TypeScript", "React", "Node.js"],
        workHistory: ["Senior Engineer at TechCorp"],
        education: ["B.S. Computer Science, UC Berkeley"],
      }),
    });
  });
}

/** Shared mock for the consent endpoint used in the disclaimer step. */
function mockConsentCreate(page: import("@playwright/test").Page) {
  return page.route("**/api/v1/consent", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          id: "00000000-0000-0000-0000-000000000020",
          type: "copilot_disclaimer",
          version: "1.0",
          createdAt: new Date().toISOString(),
        }),
      });
    } else {
      await route.continue();
    }
  });
}

/** Helper: complete step 1 (resume upload). */
async function completeStep1(page: import("@playwright/test").Page) {
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(RESUME_FIXTURE);
  // After successful upload, the component shows "Resume uploaded successfully"
  await expect(page.getByText(/resume uploaded successfully/i)).toBeVisible();
}

/** Helper: complete step 2 (quick review). */
async function completeStep2(page: import("@playwright/test").Page) {
  // Wait for profile to load and the confirm button to appear
  await expect(
    page.getByRole("button", { name: /looks good/i }),
  ).toBeVisible();
  await page.getByRole("button", { name: /looks good/i }).click();
}

/** Helper: complete step 3 (disclaimer). */
async function completeStep3(page: import("@playwright/test").Page) {
  // Check both checkboxes
  await page
    .getByLabel(/I understand that Valet will automate/i)
    .check();
  await page
    .getByLabel(/I accept the/i)
    .check();
  // Click accept button
  await page
    .getByRole("button", { name: /accept & get started/i })
    .click();
}

test.describe("Onboarding Flow", () => {
  test.beforeEach(async ({ page }) => {
    const user = createTestUser();
    await authenticate(page.context(), user);
    await mockAuthMe(page, user);
  });

  test("displays step 1: resume upload", async ({ page }) => {
    await page.goto("/onboarding");

    // Step indicators should be visible
    await expect(page.getByText("Upload Resume")).toBeVisible();
    await expect(page.getByText("Review Details")).toBeVisible();
    await expect(page.getByText("Get Started")).toBeVisible();

    // Resume upload area should be present
    await expect(page.getByText(/upload your resume/i)).toBeVisible();
    await expect(page.getByText(/drag and drop/i)).toBeVisible();
  });

  test("accepts resume via file input", async ({ page }) => {
    await mockResumeUpload(page);
    await page.goto("/onboarding");

    // Verify the file input exists and accepts PDF/DOCX
    const fileInput = page.locator('input[type="file"]');
    await expect(fileInput).toHaveCount(1);
    await expect(fileInput).toHaveAttribute("accept", ".pdf,.docx");

    // Upload the test PDF fixture
    await fileInput.setInputFiles(RESUME_FIXTURE);

    // Should show success state after upload completes
    await expect(page.getByText(/resume uploaded successfully/i)).toBeVisible();
  });

  test("advances to step 2: quick review after upload", async ({ page }) => {
    await mockResumeUpload(page);
    await mockUserProfile(page);
    await page.goto("/onboarding");

    // Upload resume to complete step 1
    await completeStep1(page);

    // Should now show the review step with profile data
    await expect(page.getByText("Does this look right?")).toBeVisible();
    await expect(page.getByText("Alice Johnson")).toBeVisible();
    await expect(page.getByText("alice@example.com")).toBeVisible();
  });

  test("step 2: quick review shows parsed resume fields", async ({ page }) => {
    await mockResumeUpload(page);
    await mockUserProfile(page);
    await page.goto("/onboarding");

    // Navigate through step 1 first
    await completeStep1(page);

    // Verify parsed fields are displayed
    await expect(page.getByText("Alice Johnson")).toBeVisible();
    await expect(page.getByText("alice@example.com")).toBeVisible();

    // Phone and location are editable inputs
    await expect(page.locator('input[value="(555) 123-4567"]')).toBeVisible();
    await expect(
      page.locator('input[value="San Francisco, CA"]'),
    ).toBeVisible();

    // Skills are shown as tags
    await expect(page.getByText("TypeScript")).toBeVisible();
    await expect(page.getByText("React")).toBeVisible();
    await expect(page.getByText("Node.js")).toBeVisible();

    // Experience entries are listed
    await expect(
      page.getByText("Senior Engineer at TechCorp"),
    ).toBeVisible();

    // A confirm button is available
    await expect(
      page.getByRole("button", { name: /looks good/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /looks good/i }),
    ).toBeEnabled();
  });

  test("completing review navigates to /dashboard", async ({ page }) => {
    await mockResumeUpload(page);
    await mockUserProfile(page);
    await mockConsentCreate(page);

    // Mock the update profile endpoint for review confirm
    await page.route("**/api/v1/users/profile", async (route) => {
      if (route.request().method() === "PATCH") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ success: true }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/onboarding");

    // Step 1: Upload resume
    await completeStep1(page);

    // Step 2: Confirm review
    await completeStep2(page);

    // Step 3: Accept disclaimer
    await expect(page.getByText("Before We Begin")).toBeVisible();
    await completeStep3(page);

    // Should redirect to dashboard after completing onboarding
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("onboarding completes within 90 seconds", async ({ page }) => {
    // Doc 05 specifies 3-step onboarding should complete within 90 seconds
    await mockResumeUpload(page);
    await mockUserProfile(page);
    await mockConsentCreate(page);

    await page.route("**/api/v1/users/profile", async (route) => {
      if (route.request().method() === "PATCH") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ success: true }),
        });
      } else {
        await route.continue();
      }
    });

    const startTime = Date.now();

    await page.goto("/onboarding");

    // Step 1: Upload resume
    await completeStep1(page);

    // Step 2: Confirm review
    await completeStep2(page);

    // Step 3: Accept disclaimer
    await completeStep3(page);

    await expect(page).toHaveURL(/\/dashboard/);

    const elapsed = Date.now() - startTime;
    expect(elapsed).toBeLessThan(90_000);
  });
});
